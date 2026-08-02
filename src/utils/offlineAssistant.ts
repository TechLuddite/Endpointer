/**
 * The offline assistant.
 *
 * This is a small deterministic pattern matcher, NOT a language model. It runs
 * when no AI backend is configured, so that the prompt chips still do something
 * useful on a static deployment.
 *
 * Two rules govern everything here, because the previous version of this code
 * broke both of them:
 *
 *  1. It must never be presented as AI. Every reply is tagged `source:
 *     'offline'` and the UI labels it accordingly. The old version returned
 *     these canned strings while the interface said "AI Assistant is analyzing
 *     query context…".
 *
 *  2. It must never fabricate a credential. The old version answered any
 *     mention of "auth" or "token" with "I've enabled Bearer Token
 *     authentication mode with a test API key" and injected the literal string
 *     `sk_test_endpointer_bearer_token_99812` into the request. That is an
 *     invented secret presented as a real one.
 *
 * When it cannot help, it says so plainly instead of claiming to have applied
 * changes it did not make.
 */

import type { ApiResponseData, RequestConfig } from '../types';
import { inferTypeScript } from './typeInference';

export interface OfflineReply {
  message: string;
  actionSummary?: string;
  configUpdate?: Partial<RequestConfig>;
  source: 'offline';
}

const OFFLINE_NOTE =
  '_This is the offline helper — pattern matching in your browser, not a language model. Configure `GEMINI_API_KEY` on a server deployment for real AI assistance._';

function reply(
  message: string,
  actionSummary?: string,
  configUpdate?: Partial<RequestConfig>,
): OfflineReply {
  return {
    message: `${message}\n\n${OFFLINE_NOTE}`,
    actionSummary,
    configUpdate,
    source: 'offline',
  };
}

const POKEMON_NAMES = [
  'pikachu',
  'charizard',
  'bulbasaur',
  'squirtle',
  'mewtwo',
  'ditto',
  'eevee',
  'snorlax',
  'gengar',
  'lucario',
];

/**
 * Match whole words only.
 *
 * Naive `includes()` is why "summarise the OAuth2 device flow" used to be
 * treated as "configure bearer auth" — "oauth2" contains "auth". Anchoring on
 * word boundaries keeps an incidental substring from hijacking the intent.
 */
function hasWord(text: string, ...words: string[]): boolean {
  return words.some((word) =>
    new RegExp(
      `(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
      'i',
    ).test(text),
  );
}

export function generateOfflineReply(
  prompt: string,
  context: { config: RequestConfig; response: ApiResponseData | null },
): OfflineReply {
  const lower = prompt.toLowerCase();
  const namedPokemon = POKEMON_NAMES.find((name) => hasWord(lower, name));

  if (hasWord(lower, 'pokemon', 'pokémon', 'pokedex', 'pokédex') || namedPokemon) {
    let target = 'pikachu';
    let summary = "Set the URL to the PokéAPI entry for 'pikachu'";

    if (hasWord(lower, 'random')) {
      const id = Math.floor(Math.random() * 151) + 1;
      target = String(id);
      summary = `Set the URL to a random PokéAPI entry (#${id})`;
    } else if (namedPokemon) {
      target = namedPokemon;
      summary = `Set the URL to the PokéAPI entry for '${namedPokemon}'`;
    }

    return reply(
      `Set up a **GET** request to the PokéAPI entry for \`${target}\`. PokéAPI sends CORS headers, so this runs directly from the browser.`,
      summary,
      { method: 'GET', url: `https://pokeapi.co/api/v2/pokemon/${target}`, params: [] },
    );
  }

  if (hasWord(lower, 'weather', 'forecast', 'temperature')) {
    const city = hasWord(lower, 'tokyo')
      ? { name: 'Tokyo', lat: '35.6762', lon: '139.6503' }
      : hasWord(lower, 'london')
        ? { name: 'London', lat: '51.5072', lon: '-0.1276' }
        : { name: 'San Francisco', lat: '37.7749', lon: '-122.4194' };

    return reply(
      `Set up a current-weather request to Open-Meteo for **${city.name}**. No API key required, and it sends CORS headers.`,
      `Set the URL to the Open-Meteo forecast for ${city.name}`,
      {
        method: 'GET',
        url: 'https://api.open-meteo.com/v1/forecast',
        params: [
          { id: 'lat', key: 'latitude', value: city.lat, enabled: true },
          { id: 'lon', key: 'longitude', value: city.lon, enabled: true },
          { id: 'cw', key: 'current_weather', value: 'true', enabled: true },
        ],
      },
    );
  }

  if (
    hasWord(lower, 'post', 'payload', 'body') &&
    hasWord(
      lower,
      'post',
      'payload',
      'body',
      'create',
      'sample',
      'mock',
      'configure',
      'build',
      'set',
    )
  ) {
    return reply(
      'Set up a **POST** to JSONPlaceholder with a sample JSON body. It accepts any payload and echoes it back, so it is safe to experiment against.',
      'Set method to POST and added a sample JSON body',
      {
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        params: [],
        bodyType: 'json',
        body: JSON.stringify(
          { title: 'Endpointer test', body: 'Sample request payload', userId: 1 },
          null,
          2,
        ),
      },
    );
  }

  // Auth: switch the mode on, and stop there. Filling in a value would mean
  // inventing a secret.
  //
  // This requires both an auth noun and a configure-shaped verb, so a question
  // *about* authentication ("explain the OAuth2 device flow") falls through to
  // the honest "I cannot answer that" branch rather than silently rewriting the
  // user's request.
  const authNoun =
    hasWord(lower, 'auth', 'authentication', 'authorization', 'bearer', 'token', 'apikey') ||
    /api\s+key/i.test(lower);
  const configureVerb = hasWord(
    lower,
    'set',
    'setup',
    'configure',
    'add',
    'enable',
    'use',
    'switch',
    'build',
    'need',
  );
  if (authNoun && configureVerb) {
    const wantsBasic = hasWord(lower, 'basic');
    const wantsApiKey = /api\s*key/i.test(lower);
    const authType = wantsBasic ? 'Basic Auth' : wantsApiKey ? 'API Key' : 'Bearer Token';
    const field = wantsBasic
      ? 'username and password'
      : wantsApiKey
        ? 'key name and value'
        : 'token';

    return reply(
      `Switched the auth mode to **${authType}**. Open the **Auth** tab and enter your ${field} — I will not generate one for you, and you should be suspicious of any tool that does.`,
      `Set auth type to ${authType}`,
      { authType },
    );
  }

  if (hasWord(lower, 'interface', 'typescript', 'types', 'type', 'schema', 'zod', 'dataclass')) {
    if (!context.response) {
      return reply(
        'I can generate a TypeScript interface, but I need a response first. Press **Send** and ask again — the types are derived from the actual payload, not guessed from the URL.',
      );
    }
    return reply(
      `Derived from the last response payload:\n\n\`\`\`typescript\n${inferTypeScript(context.response.data)}\n\`\`\``,
      'Generated a TypeScript interface',
    );
  }

  if (hasWord(lower, 'explain', 'error', 'why', 'failed', 'failing', 'status')) {
    const response = context.response;
    if (!response) {
      return reply('There is no response to explain yet — press **Send** first.');
    }
    return reply(explainStatus(response));
  }

  return reply(
    `I cannot answer "${prompt}" — the offline helper only recognises a few specific requests (Pokémon, weather, a sample POST, auth setup, type generation, and status-code explanations).\n\nI have **not** changed your request configuration. For open-ended questions, run Endpointer with a \`GEMINI_API_KEY\` configured.`,
  );
}

const STATUS_NOTES: Record<number, string> = {
  400: 'The server rejected the request as malformed. Check the body and the query parameters.',
  401: 'Authentication is required or the credential was rejected. Check the Auth tab.',
  403: 'Authenticated but not permitted, or the API blocks this origin/user agent.',
  404: 'The path does not exist on this server. Check for a version prefix such as /v1.',
  405: 'The path exists but does not accept this HTTP method.',
  409: 'The request conflicts with the current state of the resource.',
  415: 'Unsupported media type — usually a missing or wrong Content-Type header.',
  422: 'The payload parsed but failed validation. The body usually says which field.',
  429: 'Rate limited. Look for Retry-After or X-RateLimit-* in the response headers.',
  500: 'The server failed. Nothing to fix on the client side.',
  502: 'A gateway upstream of the API returned an invalid response.',
  503: 'The service is temporarily unavailable or in maintenance.',
  504: 'A gateway upstream of the API timed out.',
};

export function explainStatus(response: ApiResponseData): string {
  if (response.status === 0) {
    const kind = response.errorKind ?? 'unknown';
    const explanations: Record<string, string> = {
      cors: 'The request left the browser but the response was blocked because the API did not send an `Access-Control-Allow-Origin` header. This is a browser policy — no client-side change can bypass it. Use the proxy, or copy the generated cURL snippet and run it in a terminal.',
      dns: 'The hostname could not be resolved. Check for a typo, or the domain may no longer exist.',
      timeout: 'The request exceeded its timeout without a response.',
      tls: 'The TLS handshake failed — an expired, self-signed, or mismatched certificate.',
      offline: 'Your browser reports no network connection.',
      aborted: 'The request was cancelled.',
      network: 'The connection failed before a response was received.',
      unknown: 'The request failed before any response arrived.',
    };
    return `**No HTTP response** (${kind}). ${explanations[kind] ?? explanations.unknown}`;
  }

  const note =
    STATUS_NOTES[response.status] ??
    (response.status < 300
      ? 'Success.'
      : response.status < 400
        ? 'A redirect. The client followed it or reported it depending on transport.'
        : 'See the response body for detail.');

  const bodyHint =
    typeof response.data === 'object' && response.data !== null
      ? `\n\nResponse body:\n\`\`\`json\n${JSON.stringify(response.data, null, 2).slice(0, 800)}\n\`\`\``
      : '';

  return `**HTTP ${response.status} ${response.statusText}** — ${note}${bodyHint}`;
}
