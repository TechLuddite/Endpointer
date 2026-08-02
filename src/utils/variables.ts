/**
 * `{{variable}}` substitution.
 *
 * Without this, a shared collection has to carry real tokens inline — which is
 * how credentials end up in an exported JSON file that gets emailed to someone.
 * Variables marked `secret` live in a separate storage key and are stripped
 * from exports.
 */

import type { Environment, KeyValuePair, RequestConfig } from '../types';

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;
const MAX_PASSES = 5;

export interface ResolvedVariables {
  values: Map<string, string>;
  secretKeys: Set<string>;
}

export function resolveEnvironment(environment: Environment | null): ResolvedVariables {
  const values = new Map<string, string>();
  const secretKeys = new Set<string>();
  for (const variable of environment?.variables ?? []) {
    if (!variable.enabled || !variable.key.trim()) continue;
    values.set(variable.key, variable.value);
    if (variable.secret) secretKeys.add(variable.key);
  }
  return { values, secretKeys };
}

/**
 * Substitute placeholders in a string. Runs to a fixed point so a variable can
 * reference another (`{{baseUrl}}` = `{{scheme}}://{{host}}`), with a pass
 * limit so a self-referential definition cannot spin.
 */
export function interpolate(input: string, vars: ResolvedVariables): string {
  if (!input.includes('{{')) return input;
  let out = input;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = out.replace(PLACEHOLDER, (match, name: string) => vars.values.get(name) ?? match);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Every placeholder in a string that has no definition. */
export function findUnresolved(input: string, vars: ResolvedVariables): string[] {
  const missing = new Set<string>();
  for (const match of input.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name && !vars.values.has(name)) missing.add(name);
  }
  return [...missing];
}

function interpolatePairs(pairs: KeyValuePair[], vars: ResolvedVariables): KeyValuePair[] {
  return pairs.map((p) => ({
    ...p,
    key: interpolate(p.key, vars),
    value: interpolate(p.value, vars),
  }));
}

/** Apply the active environment to a request, immediately before sending. */
export function applyVariables(config: RequestConfig, vars: ResolvedVariables): RequestConfig {
  return {
    ...config,
    url: interpolate(config.url, vars),
    params: interpolatePairs(config.params, vars),
    headers: interpolatePairs(config.headers, vars),
    body: interpolate(config.body, vars),
    authConfig: {
      ...config.authConfig,
      apiKeyName: config.authConfig.apiKeyName
        ? interpolate(config.authConfig.apiKeyName, vars)
        : config.authConfig.apiKeyName,
      apiKeyValue: config.authConfig.apiKeyValue
        ? interpolate(config.authConfig.apiKeyValue, vars)
        : config.authConfig.apiKeyValue,
      bearerToken: config.authConfig.bearerToken
        ? interpolate(config.authConfig.bearerToken, vars)
        : config.authConfig.bearerToken,
      basicUsername: config.authConfig.basicUsername
        ? interpolate(config.authConfig.basicUsername, vars)
        : config.authConfig.basicUsername,
      basicPassword: config.authConfig.basicPassword
        ? interpolate(config.authConfig.basicPassword, vars)
        : config.authConfig.basicPassword,
    },
  };
}

/** All unresolved placeholders across a whole request. */
export function findUnresolvedInConfig(config: RequestConfig, vars: ResolvedVariables): string[] {
  const fields = [
    config.url,
    config.body,
    ...config.params.flatMap((p) => [p.key, p.value]),
    ...config.headers.flatMap((h) => [h.key, h.value]),
    config.authConfig.bearerToken ?? '',
    config.authConfig.apiKeyValue ?? '',
    config.authConfig.basicPassword ?? '',
  ];
  const missing = new Set<string>();
  for (const field of fields) for (const name of findUnresolved(field, vars)) missing.add(name);
  return [...missing];
}

/**
 * Replace literal secret values with their `{{placeholder}}` form.
 *
 * Used on export, so a collection can be shared without the credentials that
 * were used to test it.
 */
export function stripSecrets(config: RequestConfig, vars: ResolvedVariables): RequestConfig {
  const secrets = [...vars.secretKeys]
    .map((key) => ({ key, value: vars.values.get(key) ?? '' }))
    .filter((s) => s.value.length >= 4)
    // Longest first, so an overlapping shorter secret cannot partially match.
    .sort((a, b) => b.value.length - a.value.length);

  const scrub = (text: string): string => {
    let out = text;
    for (const { key, value } of secrets) out = out.split(value).join(`{{${key}}}`);
    return out;
  };

  const scrubPairs = (pairs: KeyValuePair[]) =>
    pairs.map((p) => ({ ...p, key: scrub(p.key), value: scrub(p.value) }));

  return {
    ...config,
    url: scrub(config.url),
    params: scrubPairs(config.params),
    headers: scrubPairs(config.headers),
    body: scrub(config.body),
    // Auth values are dropped entirely rather than scrubbed: a literal token
    // that does not correspond to any declared secret would otherwise survive.
    authConfig: {
      apiKeyName: config.authConfig.apiKeyName,
      apiKeyIn: config.authConfig.apiKeyIn,
      apiKeyValue: config.authConfig.apiKeyValue ? '{{apiKey}}' : '',
      bearerToken: config.authConfig.bearerToken ? '{{token}}' : '',
      basicUsername: config.authConfig.basicUsername,
      basicPassword: config.authConfig.basicPassword ? '{{password}}' : '',
    },
  };
}
