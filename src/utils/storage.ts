/**
 * localStorage persistence.
 *
 * Two failures this replaces:
 *
 *  - Nothing validated what came back out. A corrupt or hand-edited value threw
 *    during render and, because it stayed on disk, threw again on every reload.
 *    The app was unusable until the user cleared site data by hand.
 *  - saveHistoryItem returned `[]` on any throw — including the quota error you
 *    reliably hit while storing fifty full response bodies — so the caller set
 *    history to empty and the user watched their history apparently vanish
 *    while it was still on disk.
 *
 * Reads go through the validators in validation.ts. Writes report failure
 * instead of silently returning an empty list, and history sheds weight rather
 * than dying when the quota is reached.
 */

import type { CollectionItem, Environment, RequestHistoryItem } from '../types';
import { parseCollections, parseEnvironments, parseFavorites, parseHistory } from './validation';

const SCHEMA_VERSION = 2;

const KEYS = {
  version: 'endpointer_schema_version',
  history: 'endpointer_request_history_v2',
  collections: 'endpointer_collections_v2',
  favorites: 'endpointer_favorites_v2',
  environments: 'endpointer_environments_v1',
  activeEnvironment: 'endpointer_active_environment_v1',
  legacyHistory: 'endpointer_request_history_v1',
  legacyCollections: 'endpointer_collections_v1',
  legacyFavorites: 'endpointer_favorites_v1',
} as const;

const MAX_HISTORY = 50;
const DEFAULT_FAVORITES = ['open-meteo', 'coingecko', 'pokeapi'];

export type WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function storageAvailable(): boolean {
  try {
    const probe = '__endpointer_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): WriteResult {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: isQuota ? 'quota' : 'unavailable' };
  }
}

/**
 * One-time migration from the v1 keys. Old data goes through the same
 * validators, so a legacy value that would have crashed the app is repaired
 * rather than carried forward.
 */
export function migrateIfNeeded(): void {
  if (!storageAvailable()) return;
  const current = Number(localStorage.getItem(KEYS.version) ?? 0);
  if (current >= SCHEMA_VERSION) return;

  const legacyCollections = readJson(KEYS.legacyCollections);
  if (legacyCollections && !localStorage.getItem(KEYS.collections)) {
    writeJson(KEYS.collections, parseCollections(legacyCollections));
  }

  const legacyHistory = readJson(KEYS.legacyHistory);
  if (legacyHistory && !localStorage.getItem(KEYS.history)) {
    writeJson(KEYS.history, parseHistory(legacyHistory));
  }

  const legacyFavorites = readJson(KEYS.legacyFavorites);
  if (legacyFavorites && !localStorage.getItem(KEYS.favorites)) {
    writeJson(KEYS.favorites, parseFavorites(legacyFavorites));
  }

  try {
    localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
  } catch {
    /* nothing more we can do */
  }
}

/* ----------------------------- history ----------------------------- */

export function getSavedHistory(): RequestHistoryItem[] {
  return parseHistory(readJson(KEYS.history));
}

/**
 * Prepend an item, then persist. On a quota error, shed stored response bodies
 * and then older entries and retry — never report an empty history. The list
 * returned here is always what the UI should display.
 */
export function saveHistoryItem(item: RequestHistoryItem): RequestHistoryItem[] {
  const existing = getSavedHistory();
  let updated = [item, ...existing.filter((h) => h.id !== item.id)].slice(0, MAX_HISTORY);

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = writeJson(KEYS.history, updated);
    if (result.ok) return updated;
    if (result.reason !== 'quota') return updated;

    updated =
      attempt === 0
        ? // Response bodies dominate the payload; drop all but the newest.
          updated.map((h, index) => (index === 0 ? h : { ...h, response: undefined }))
        : updated.slice(0, Math.max(1, Math.floor(updated.length / 2)));
  }

  return updated;
}

export function clearHistoryStorage(): void {
  try {
    localStorage.removeItem(KEYS.history);
  } catch {
    /* ignore */
  }
}

/* --------------------------- collections --------------------------- */

const STARTER_COLLECTION: CollectionItem = {
  id: 'starter-collection',
  name: 'Starter collection',
  description: 'A few browser-friendly endpoints to try',
  createdAt: 0,
  requests: [
    {
      name: 'Current weather (San Francisco)',
      method: 'GET',
      url: 'https://api.open-meteo.com/v1/forecast',
      params: [
        { id: 'lat', key: 'latitude', value: '37.7749', enabled: true },
        { id: 'lon', key: 'longitude', value: '-122.4194', enabled: true },
        { id: 'cw', key: 'current_weather', value: 'true', enabled: true },
      ],
      headers: [],
      authType: 'No Auth',
      authConfig: {},
      bodyType: 'none',
      body: '',
      useProxy: false,
    },
    {
      name: 'Pokédex entry',
      method: 'GET',
      url: 'https://pokeapi.co/api/v2/pokemon/pikachu',
      params: [],
      headers: [],
      authType: 'No Auth',
      authConfig: {},
      bodyType: 'none',
      body: '',
      useProxy: false,
    },
  ],
};

export function getSavedCollections(): CollectionItem[] {
  const raw = readJson(KEYS.collections);
  if (raw === null) {
    const initial = [{ ...STARTER_COLLECTION, createdAt: Date.now() }];
    writeJson(KEYS.collections, initial);
    return initial;
  }
  return parseCollections(raw);
}

export function saveCollections(collections: CollectionItem[]): WriteResult {
  return writeJson(KEYS.collections, collections);
}

/* ---------------------------- favorites ---------------------------- */

export function getFavoriteApis(): string[] {
  const raw = readJson(KEYS.favorites);
  return raw === null ? [...DEFAULT_FAVORITES] : parseFavorites(raw);
}

export function toggleFavoriteApi(apiId: string): string[] {
  const favorites = getFavoriteApis();
  const updated = favorites.includes(apiId)
    ? favorites.filter((id) => id !== apiId)
    : [...favorites, apiId];
  writeJson(KEYS.favorites, updated);
  return updated;
}

/* --------------------------- environments -------------------------- */

export function getEnvironments(): Environment[] {
  return parseEnvironments(readJson(KEYS.environments));
}

export function saveEnvironments(environments: Environment[]): WriteResult {
  return writeJson(KEYS.environments, environments);
}

export function getActiveEnvironmentId(): string | null {
  try {
    return localStorage.getItem(KEYS.activeEnvironment);
  } catch {
    return null;
  }
}

export function setActiveEnvironmentId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEYS.activeEnvironment, id);
    else localStorage.removeItem(KEYS.activeEnvironment);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ reset ------------------------------ */

/**
 * Escape hatch surfaced in the UI. Previously the only way out of a bad
 * persisted state was clearing site data from browser settings.
 */
export function resetAllAppData(): void {
  for (const key of Object.values(KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function estimateStorageBytes(): number {
  let total = 0;
  for (const key of Object.values(KEYS)) {
    try {
      total += (localStorage.getItem(key) ?? '').length * 2; // UTF-16 code units
    } catch {
      /* ignore */
    }
  }
  return total;
}
