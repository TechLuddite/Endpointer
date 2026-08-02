/**
 * Loader for the committed health data (public/status.json).
 *
 * This is what turns "Uptime Health: 100%" — previously hardcoded, and computed
 * from a single live ping when it was computed at all — into a real number, and
 * what fills in the per-API CORS badge that used to be hand-asserted as 'yes'
 * for every entry.
 */

import type { CorsSupport, StatusEntry, StatusFile } from '../types';

function isStatusFile(value: unknown): value is StatusFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<StatusFile>;
  return file.version === 1 && Array.isArray(file.entries) && typeof file.generatedAt === 'string';
}

/**
 * Fetch the status file. Returns null when it is absent — which is the normal
 * state before the first scheduled run — so callers can render "not yet
 * verified" instead of inventing a number.
 */
export async function loadStatusFile(
  baseUrl = import.meta.env?.BASE_URL ?? '/',
): Promise<StatusFile | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/status.json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
    const parsed: unknown = await res.json();
    return isStatusFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function indexStatus(file: StatusFile | null): Map<string, StatusEntry> {
  const map = new Map<string, StatusEntry>();
  for (const entry of file?.entries ?? []) map.set(entry.id, entry);
  return map;
}

export interface CorsBadge {
  level: CorsSupport;
  label: string;
  detail: string;
}

/** Human-readable browser-usability badge for a directory entry. */
export function corsBadge(entry: StatusEntry | undefined): CorsBadge {
  if (!entry) {
    return {
      level: 'unknown',
      label: 'Unverified',
      detail: 'Not yet covered by a scheduled check.',
    };
  }
  if (!entry.ok) {
    return {
      level: 'no',
      label: 'Unreachable',
      detail: entry.error
        ? `Last check failed: ${entry.error}`
        : `Last check returned HTTP ${entry.status}.`,
    };
  }
  if (entry.cors === 'yes') {
    return {
      level: 'yes',
      label: 'Browser-ready',
      detail: 'Sends CORS headers — this runs directly from the browser.',
    };
  }
  return {
    level: 'no',
    label: 'Needs proxy',
    detail:
      'Reachable, but sends no CORS headers. The browser will block it; use the proxy or the generated cURL snippet.',
  };
}

/** Relative age of the data, for the "checked N ago" line. */
export function formatAge(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
