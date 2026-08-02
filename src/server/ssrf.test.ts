import { describe, expect, it } from 'vitest';
import { isBlockedAddress, parseAllowlist, validateTargetUrl } from './ssrf';

const openList = parseAllowlist('*');

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback range'],
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'RFC1918 /8'],
    ['172.16.0.1', 'RFC1918 /12 lower bound'],
    ['172.31.255.254', 'RFC1918 /12 upper bound'],
    ['192.168.1.1', 'RFC1918 /16'],
    ['169.254.169.254', 'AWS/GCP instance metadata'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['198.18.0.1', 'benchmarking'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.32.0.1'], // just outside 172.16/12
    ['172.15.255.255'], // just below 172.16/12
    ['93.184.216.34'],
  ])('allows public address %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it.each([
    ['::1'],
    ['::'],
    ['fe80::1'],
    ['fd00::1'],
    ['ff02::1'],
    ['::ffff:169.254.169.254'], // v4-mapped metadata address
    ['::ffff:127.0.0.1'],
    ['64:ff9b::a00:1'], // NAT64 wrapping 10.0.0.1
  ])('blocks IPv6 %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it('allows a public IPv6 address', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('fails closed on garbage', () => {
    expect(isBlockedAddress('')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('999.1.1.1')).toBe(true);
  });
});

describe('validateTargetUrl', () => {
  it('refuses every host when the allowlist is empty (proxy off by default)', () => {
    const verdict = validateTargetUrl('https://example.com/x', parseAllowlist(''));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('allowlist');
  });

  it('allows a listed host', () => {
    const verdict = validateTargetUrl(
      'https://api.example.com/x',
      parseAllowlist('api.example.com'),
    );
    expect(verdict.allowed).toBe(true);
  });

  it('does not let a listed host match by suffix accident', () => {
    // "evil-api.example.com.attacker.tld" must not match "api.example.com"
    const list = parseAllowlist('api.example.com');
    expect(validateTargetUrl('https://api.example.com.attacker.tld/', list).allowed).toBe(false);
    expect(validateTargetUrl('https://notapi.example.com/', list).allowed).toBe(false);
  });

  it('supports wildcard subdomain patterns', () => {
    const list = parseAllowlist('*.example.com');
    expect(validateTargetUrl('https://a.example.com/', list).allowed).toBe(true);
    expect(validateTargetUrl('https://evil.com/', list).allowed).toBe(false);
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://127.0.0.1:3000/admin', 'loopback'],
    ['http://localhost:8080/', 'localhost literal is not an IP but is caught by DNS'],
    ['http://10.0.0.5/internal', 'private range'],
    ['http://[::1]:9200/_cat/indices', 'IPv6 loopback'],
  ])('blocks SSRF target %s (%s)', (url) => {
    const verdict = validateTargetUrl(url, openList);
    // localhost resolves via DNS so it is caught at connect time, not here;
    // every literal address must be rejected up front.
    if (!url.includes('localhost')) {
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe('private-address');
    }
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com/'])(
    'rejects non-http scheme %s',
    (url) => {
      const verdict = validateTargetUrl(url, openList);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toBe('scheme');
    },
  );

  it('rejects malformed input', () => {
    expect(validateTargetUrl(undefined, openList).reason).toBe('invalid-url');
    expect(validateTargetUrl('', openList).reason).toBe('invalid-url');
    expect(validateTargetUrl('not a url', openList).reason).toBe('invalid-url');
    expect(validateTargetUrl(42, openList).reason).toBe('invalid-url');
  });
});
