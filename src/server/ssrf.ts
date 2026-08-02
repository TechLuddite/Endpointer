/**
 * Host and address validation for the outbound proxy.
 *
 * The proxy takes a URL from an untrusted request body and fetches it. Without
 * these checks that is a server-side request forgery primitive: anyone able to
 * reach the server can read cloud instance metadata, internal admin panels, or
 * anything else reachable from the host's network, and have the response
 * relayed back to them verbatim.
 *
 * Everything here is pure so it can be unit tested without a network.
 */

export type BlockReason =
  'scheme' | 'allowlist' | 'private-address' | 'invalid-url' | 'invalid-host';

export interface UrlVerdict {
  allowed: boolean;
  reason?: BlockReason;
  detail?: string;
  url?: URL;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Parse a dotted-quad IPv4 string into its 32-bit numeric form. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** CIDR blocks that must never be reachable through the proxy. */
const BLOCKED_V4: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // RFC6598 carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — includes 169.254.169.254 cloud metadata
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255 broadcast
];

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable: fail closed
  for (const [network, bits] of BLOCKED_V4) {
    const net = ipv4ToInt(network);
    if (net === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) >>> 0 === (net & mask) >>> 0) return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? '';

  // IPv4-mapped and IPv4-compatible forms (::ffff:169.254.169.254) tunnel the
  // whole v4 blocklist through v6, so unwrap and re-check them as v4.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);

  if (addr === '::' || addr === '::1') return true; // unspecified, loopback
  if (addr.startsWith('fe8') || addr.startsWith('fe9')) return true; // link-local
  if (addr.startsWith('fea') || addr.startsWith('feb')) return true; // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true; // multicast
  if (addr.startsWith('2001:db8')) return true; // documentation
  if (addr.startsWith('64:ff9b')) return true; // NAT64 — can reach v4 privates
  return false;
}

/**
 * True when an IP literal points somewhere the proxy must not reach.
 * Callers must apply this to every address DNS resolves to, not just the first.
 */
export function isBlockedAddress(ip: string, family?: number): boolean {
  if (!ip) return true;
  const isV6 = family === 6 || ip.includes(':');
  return isV6 ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

/** Parse the PROXY_ALLOWED_HOSTS env value into a normalised set. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hostMatches(hostname: string, pattern: string): boolean {
  if (pattern === hostname) return true;
  // A leading dot or wildcard covers subdomains: ".example.com" or "*.example.com"
  if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
  if (pattern.startsWith('.')) return hostname.endsWith(pattern);
  return false;
}

/**
 * Validate a proxy target before any DNS lookup or socket is opened.
 * An empty allowlist means the proxy is disabled outright.
 */
export function validateTargetUrl(rawUrl: unknown, allowlist: Set<string>): UrlVerdict {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { allowed: false, reason: 'invalid-url', detail: "A target 'url' string is required." };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'invalid-url', detail: 'Target URL could not be parsed.' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      allowed: false,
      reason: 'scheme',
      detail: `Only http and https are proxied (got "${url.protocol}").`,
    };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { allowed: false, reason: 'invalid-host', detail: 'Target URL has no hostname.' };
  }

  // Reject IP literals that are already known-bad without waiting for DNS.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    if (isBlockedAddress(hostname)) {
      return {
        allowed: false,
        reason: 'private-address',
        detail: `${hostname} is a private, loopback, link-local or reserved address.`,
      };
    }
  }

  if (allowlist.size === 0) {
    return {
      allowed: false,
      reason: 'allowlist',
      detail:
        'The proxy is disabled. Set PROXY_ALLOWED_HOSTS to a comma-separated host list to enable it.',
    };
  }

  if (!allowlist.has('*')) {
    const permitted = [...allowlist].some((pattern) => hostMatches(hostname, pattern));
    if (!permitted) {
      return {
        allowed: false,
        reason: 'allowlist',
        detail: `${hostname} is not in PROXY_ALLOWED_HOSTS.`,
      };
    }
  }

  return { allowed: true, url };
}
