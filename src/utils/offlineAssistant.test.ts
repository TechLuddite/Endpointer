import { describe, expect, it } from 'vitest';
import { generateOfflineReply } from './offlineAssistant';
import type { ApiResponseData, RequestConfig } from '../types';

const config: RequestConfig = {
  method: 'GET',
  url: 'https://api.example.com/x',
  params: [],
  headers: [],
  authType: 'No Auth',
  authConfig: {},
  bodyType: 'none',
  body: '',
  useProxy: false,
};

const ctx = { config, response: null };

describe('offline assistant honesty', () => {
  it('never fabricates a credential, whatever the phrasing', () => {
    const prompts = [
      'Set auth to Bearer Token',
      'add a bearer token',
      'set up authentication',
      'give me an api key',
      'configure basic auth',
      'I need a token for this request',
    ];
    for (const prompt of prompts) {
      const out = generateOfflineReply(prompt, ctx);
      expect(out.configUpdate?.authConfig).toBeUndefined();
      const serialized = JSON.stringify(out);
      expect(serialized).not.toMatch(/sk_test/i);
      expect(serialized).not.toMatch(/sk_live/i);
      expect(serialized).not.toMatch(/eyJ[A-Za-z0-9]/); // a JWT-looking string
    }
  });

  it('sets the auth mode and tells the user to supply the value themselves', () => {
    const out = generateOfflineReply('set up bearer token auth', ctx);
    expect(out.configUpdate?.authType).toBe('Bearer Token');
    expect(out.message).toMatch(/enter your token/i);
  });

  it('picks the auth type the user actually asked for', () => {
    expect(generateOfflineReply('configure basic auth', ctx).configUpdate?.authType).toBe(
      'Basic Auth',
    );
    expect(generateOfflineReply('add an api key', ctx).configUpdate?.authType).toBe('API Key');
  });

  it('tags every reply as offline so the UI cannot present it as AI', () => {
    for (const prompt of [
      'random pokemon',
      'weather in tokyo',
      'anything at all',
      'post payload',
    ]) {
      expect(generateOfflineReply(prompt, ctx).source).toBe('offline');
    }
  });

  it('discloses that it is not a language model in every reply', () => {
    for (const prompt of ['random pokemon', 'weather', 'gibberish query']) {
      expect(generateOfflineReply(prompt, ctx).message).toMatch(/not a language model/i);
    }
  });

  it('admits it cannot help instead of claiming it applied changes', () => {
    const out = generateOfflineReply('summarise the OAuth2 device flow for me', ctx);
    expect(out.configUpdate).toBeUndefined();
    expect(out.actionSummary).toBeUndefined();
    expect(out.message).toMatch(/have \*\*not\*\* changed/i);
  });

  it('refuses to generate types before there is a response to read', () => {
    const out = generateOfflineReply('generate a typescript interface', ctx);
    expect(out.message).toMatch(/need a response first/i);
    expect(out.message).not.toContain('interface ApiResponse {');
  });

  it('generates types from the real payload once one exists', () => {
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { id: 1, name: 'ada', active: true },
      contentType: 'application/json',
      duration: 12,
      sizeBytes: 40,
      timestamp: Date.now(),
    } satisfies ApiResponseData;

    const out = generateOfflineReply('generate a typescript interface', { config, response });
    expect(out.message).toContain('id: number;');
    expect(out.message).toContain('name: string;');
    expect(out.message).toContain('active: boolean;');
  });
});

describe('offline assistant request building', () => {
  it('puts query parameters in params, never in the URL string', () => {
    const out = generateOfflineReply('weather in tokyo', ctx);
    expect(out.configUpdate?.url).toBe('https://api.open-meteo.com/v1/forecast');
    expect(out.configUpdate?.url).not.toContain('?');
    expect(out.configUpdate?.params?.map((p) => p.key)).toEqual([
      'latitude',
      'longitude',
      'current_weather',
    ]);
  });

  it('resolves a named pokemon rather than defaulting silently', () => {
    expect(generateOfflineReply('get charizard', ctx).configUpdate?.url).toContain('charizard');
  });

  it('produces a numeric id for a random pokemon request', () => {
    const url = generateOfflineReply('random pokemon', ctx).configUpdate?.url ?? '';
    expect(url).toMatch(/\/pokemon\/\d+$/);
  });
});
