import { RequestConfig, RequestHistoryItem, CollectionItem } from '../types';

const HISTORY_KEY = 'endpointer_request_history_v1';
const COLLECTIONS_KEY = 'endpointer_collections_v1';
const FAVORITES_KEY = 'endpointer_favorites_v1';

export function getSavedHistory(): RequestHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistoryItem(item: RequestHistoryItem): RequestHistoryItem[] {
  try {
    const history = getSavedHistory();
    // Keep max 50 recent items
    const updated = [item, ...history.filter(h => h.id !== item.id)].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearHistoryStorage(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // silent catch
  }
}

export function getSavedCollections(): CollectionItem[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    if (!raw) {
      // Default initial collection
      const initial: CollectionItem[] = [
        {
          id: 'starter-collection',
          name: 'Starter Collection',
          description: 'Useful public APIs to get started with testing',
          createdAt: Date.now(),
          requests: [
            {
              method: 'GET',
              url: 'https://api.open-meteo.com/v1/forecast',
              params: [
                { id: '1', key: 'latitude', value: '37.7749', enabled: true },
                { id: '2', key: 'longitude', value: '-122.4194', enabled: true },
                { id: '3', key: 'current_weather', value: 'true', enabled: true },
              ],
              headers: [],
              authType: 'No Auth',
              authConfig: {},
              bodyType: 'none',
              body: '',
              useProxy: true,
            },
            {
              method: 'GET',
              url: 'https://api.coingecko.com/api/v3/simple/price',
              params: [
                { id: '1', key: 'ids', value: 'bitcoin,ethereum,solana', enabled: true },
                { id: '2', key: 'vs_currencies', value: 'usd,eur', enabled: true },
              ],
              headers: [],
              authType: 'No Auth',
              authConfig: {},
              bodyType: 'none',
              body: '',
              useProxy: true,
            }
          ]
        }
      ];
      localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCollections(collections: CollectionItem[]): void {
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  } catch {
    // silent
  }
}

export function getFavoriteApis(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : ['open-meteo', 'coingecko', 'pokeapi'];
  } catch {
    return ['open-meteo', 'coingecko', 'pokeapi'];
  }
}

export function toggleFavoriteApi(apiId: string): string[] {
  try {
    const favorites = getFavoriteApis();
    const updated = favorites.includes(apiId)
      ? favorites.filter(id => id !== apiId)
      : [...favorites, apiId];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
