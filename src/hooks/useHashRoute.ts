/**
 * Hash-based routing.
 *
 * The app had four tabs, no routing, and no way to link to any of them — the
 * document title changed but the address bar never did, so Back did nothing and
 * nothing was shareable. Hash routing keeps that working on a static host with
 * no server rewrite rules.
 */

import { useCallback, useEffect, useState } from 'react';

export type TabId = 'directory' | 'playground' | 'monitor' | 'collections';

const TABS: TabId[] = ['directory', 'playground', 'monitor', 'collections'];

export interface Route {
  tab: TabId;
  params: URLSearchParams;
}

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const tab = TABS.includes(path as TabId) ? (path as TabId) : 'directory';
  return { tab, params: new URLSearchParams(query) };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /**
   * `replace` avoids stacking a history entry for something the user did not
   * navigate to — loading a shared request should not require two Backs to
   * leave.
   */
  const navigate = useCallback(
    (tab: TabId, params?: Record<string, string>, options?: { replace?: boolean }) => {
      const query = new URLSearchParams(params ?? {}).toString();
      const next = `#/${tab}${query ? `?${query}` : ''}`;
      if (next === window.location.hash) return;

      if (options?.replace) {
        window.history.replaceState(null, '', next);
        setRoute(parseHash(next));
      } else {
        window.location.hash = next;
      }
    },
    [],
  );

  return { route, navigate };
}

export const TAB_TITLES: Record<TabId, string> = {
  directory: 'Public API directory',
  playground: 'REST playground',
  monitor: 'API health board',
  collections: 'Collections & history',
};
