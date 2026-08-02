import express, { type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

import { parseAllowlist, validateTargetUrl } from './src/server/ssrf.js';
import { ProxyError, safeRequest } from './src/server/safeRequest.js';
import { createRateLimiter } from './src/server/rateLimit.js';
import { redactDeep, sanitizeConfigForAi } from './src/server/redact.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

const MODEL = 'gemini-3.6-flash';
const PROXY_ALLOWLIST = parseAllowlist(process.env.PROXY_ALLOWED_HOSTS);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_PING_TARGETS = 100;
const PING_CONCURRENCY = 8;

// These bodies are request *descriptions*, not uploads. 1mb is generous.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Express advertises its stack via X-Powered-By by default.
app.disable('x-powered-by');

const limiter = createRateLimiter(RATE_LIMIT);

function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Capability probe. The client calls this once on load so it can tell the user
 * which server-backed features actually exist on this deployment, rather than
 * discovering it by silently falling back mid-conversation.
 */
app.get('/api/capabilities', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    ai: { available: aiEnabled(), model: aiEnabled() ? MODEL : null },
    proxy: {
      available: PROXY_ALLOWLIST.size > 0,
      // Deliberately not returning the allowlist itself.
      allowlistSize: PROXY_ALLOWLIST.size,
      openToAllPublicHosts: PROXY_ALLOWLIST.has('*'),
    },
    limits: {
      ratePerMinute: RATE_LIMIT,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      maxPingTargets: MAX_PING_TARGETS,
    },
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * CORS proxy.
 *
 * Refuses any host outside PROXY_ALLOWED_HOSTS, and refuses private, loopback,
 * link-local and cloud-metadata addresses unconditionally — including when a
 * permitted host redirects to one. See src/server/ssrf.ts.
 */
app.post('/api/proxy', limiter, async (req: Request, res: Response) => {
  const startTime = Date.now();

  const { url, method = 'GET', headers = {}, params = {}, body, timeout = 15000 } = req.body ?? {};

  const verdict = validateTargetUrl(url, PROXY_ALLOWLIST);
  if (!verdict.allowed || !verdict.url) {
    const status = verdict.reason === 'invalid-url' ? 400 : 403;
    res.status(status).json({
      ok: false,
      status,
      statusText: 'Blocked by proxy policy',
      error: verdict.detail,
      reason: verdict.reason,
      duration: Date.now() - startTime,
      data: null,
    });
    return;
  }

  const targetUrl = verdict.url;
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        targetUrl.searchParams.append(key, String(value));
      }
    }
  }

  // Hop-by-hop headers must not be forwarded verbatim.
  const forbidden = new Set([
    'host',
    'content-length',
    'connection',
    'keep-alive',
    'transfer-encoding',
    'upgrade',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
  ]);
  const forwardHeaders: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (!forbidden.has(k.toLowerCase())) forwardHeaders[k] = String(v);
    }
  }
  if (!Object.keys(forwardHeaders).some((k) => k.toLowerCase() === 'user-agent')) {
    forwardHeaders['User-Agent'] =
      'Endpointer-API-Tester/1.0 (+https://github.com/TechLuddite/Endpointer)';
  }

  const httpMethod = String(method).toUpperCase();
  let outboundBody: string | undefined;
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod) &&
    body !== undefined &&
    body !== null
  ) {
    if (typeof body === 'object') {
      outboundBody = JSON.stringify(body);
      if (!Object.keys(forwardHeaders).some((k) => k.toLowerCase() === 'content-type')) {
        forwardHeaders['Content-Type'] = 'application/json';
      }
    } else {
      outboundBody = String(body);
    }
    forwardHeaders['Content-Length'] = String(Buffer.byteLength(outboundBody, 'utf8'));
  }

  try {
    const result = await safeRequest({
      url: targetUrl,
      method: httpMethod,
      headers: forwardHeaders,
      body: outboundBody,
      timeoutMs: Math.min(Number(timeout) || 15000, 30000),
      maxBytes: MAX_RESPONSE_BYTES,
      maxRedirects: 5,
      allowlist: PROXY_ALLOWLIST,
    });

    const contentType = result.headers['content-type'] ?? '';
    let data: string | object = result.body;
    if (contentType.includes('json')) {
      try {
        data = JSON.parse(result.body);
      } catch {
        /* not valid JSON despite the header; keep the text */
      }
    }

    res.json({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      data,
      contentType,
      duration: Date.now() - startTime,
      sizeBytes: Buffer.byteLength(result.body, 'utf8'),
      truncated: result.truncated,
      finalUrl: result.finalUrl,
    });
  } catch (err) {
    const proxyError = err instanceof ProxyError ? err : null;
    res.status(502).json({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway / Proxy Error',
      error: proxyError?.message ?? (err as Error)?.message ?? 'Failed to fetch resource',
      reason: proxyError?.code ?? 'NETWORK_ERROR',
      duration: Date.now() - startTime,
      data: null,
    });
  }
});

/** Batch reachability check, bounded in both list length and concurrency. */
app.post('/api/ping-batch', limiter, async (req: Request, res: Response) => {
  const { urls } = req.body ?? {};
  if (!Array.isArray(urls)) {
    res.status(400).json({ error: "'urls' array is required." });
    return;
  }
  if (urls.length > MAX_PING_TARGETS) {
    res.status(400).json({ error: `At most ${MAX_PING_TARGETS} targets per request.` });
    return;
  }

  const targets = urls as Array<{ id?: string; url?: string; method?: string }>;
  const results: unknown[] = new Array(targets.length);

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const item = targets[index];
      const start = Date.now();
      const verdict = validateTargetUrl(item?.url, PROXY_ALLOWLIST);

      if (!verdict.allowed || !verdict.url) {
        results[index] = {
          id: item?.id,
          url: item?.url,
          status: 0,
          ok: false,
          error: verdict.detail,
          latency: 0,
          timestamp: Date.now(),
        };
        continue;
      }

      try {
        const resp = await safeRequest({
          url: verdict.url,
          method: (item?.method ?? 'GET').toUpperCase(),
          headers: { 'User-Agent': 'Endpointer-Ping/1.0' },
          timeoutMs: 6000,
          maxBytes: 64 * 1024,
          maxRedirects: 3,
          allowlist: PROXY_ALLOWLIST,
        });
        results[index] = {
          id: item?.id,
          url: item?.url,
          status: resp.status,
          ok: resp.status >= 200 && resp.status < 400,
          latency: Date.now() - start,
          timestamp: Date.now(),
        };
      } catch (err) {
        const code = err instanceof ProxyError ? err.code : 'NETWORK_ERROR';
        results[index] = {
          id: item?.id,
          url: item?.url,
          status: 0,
          ok: false,
          error: code === 'TIMEOUT' ? 'Timeout' : code,
          latency: Date.now() - start,
          timestamp: Date.now(),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PING_CONCURRENCY, targets.length) }, () => worker()),
  );
  res.json({ results });
});

/** Schema/payload analysis. Context is redacted before it leaves the process. */
app.post('/api/ai-analyze', limiter, async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'AI is not configured on this deployment (GEMINI_API_KEY is unset).',
      aiAvailable: false,
    });
    return;
  }

  try {
    const { prompt, context } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: "A 'prompt' string is required." });
      return;
    }

    const safeContext = JSON.stringify(redactDeep(context), null, 2).slice(0, 100_000);
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `${prompt.slice(0, 8000)}\n\nContext payload:\n${safeContext}` }],
        },
      ],
      config: {
        systemInstruction:
          'You are an expert API architect assisting inside a developer tool. Analyse response payloads, generate types, explain HTTP status codes, and draft request payloads. Be concise and concrete. Credential values are replaced with "[redacted]" before you see them — never ask for them and never invent replacements.',
        temperature: 0.2,
      },
    });

    res.json({ result: response.text, model: MODEL });
  } catch (err) {
    res.status(502).json({ error: (err as Error)?.message ?? 'AI analysis failed.' });
  }
});

const KEY_VALUE_ARRAY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING },
      value: { type: Type.STRING },
      enabled: { type: Type.BOOLEAN },
    },
  },
} as const;

/** Conversational copilot that can propose playground config changes. */
app.post('/api/ai-chat-assistant', limiter, async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'AI is not configured on this deployment (GEMINI_API_KEY is unset).',
      aiAvailable: false,
    });
    return;
  }

  try {
    const { messages = [], currentConfig = {}, responseContext = null } = req.body ?? {};
    const safeConfig = sanitizeConfigForAi(currentConfig);
    const safeResponse = responseContext
      ? JSON.stringify(redactDeep(responseContext)).slice(0, 4000)
      : null;

    const systemInstruction = `You are Endpointer's API copilot. You help developers construct HTTP requests and understand responses inside a browser-based API client.

Current playground state (credential values are already replaced with "[redacted]"):
- Method: ${safeConfig.method}
- URL: ${safeConfig.url}
- Params: ${JSON.stringify(safeConfig.params)}
- Headers: ${JSON.stringify(safeConfig.headers)}
- Auth type: ${safeConfig.authType}
- Auth fields set: ${JSON.stringify(safeConfig.authConfig)}
- Body type: ${safeConfig.bodyType}
- Body: ${safeConfig.body}
${safeResponse ? `- Latest response payload: ${safeResponse}` : '- No response has been executed yet.'}

Rules:
1. Answer the user's message in context. When they ask for a request to be built
   or changed, return the corresponding configuration in configUpdate.
2. NEVER invent, generate or fill in a credential — no API keys, bearer tokens,
   passwords or secrets, not even placeholder or "test" ones. If auth is needed,
   set authType and explain in prose which field the user must fill in
   themselves. Never populate authConfig.
3. Prefer APIs that send CORS headers, because requests run in the browser.
4. Ground every claim about the response in the payload above. If something is
   not there, say you cannot see it rather than guessing.
5. Put a short description of any configuration change in actionSummary, and
   leave it empty when you changed nothing.`;

    const history = (Array.isArray(messages) ? messages : [])
      .slice(-20)
      .map(
        (m: { sender?: string; text?: string }) =>
          `${String(m?.sender ?? 'user').toUpperCase()}: ${String(m?.text ?? '').slice(0, 4000)}`,
      )
      .join('\n');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Conversation so far:\n${history}\n\nRespond to the most recent user message.`,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            actionSummary: { type: Type.STRING },
            configUpdate: {
              type: Type.OBJECT,
              properties: {
                method: { type: Type.STRING },
                url: { type: Type.STRING },
                params: KEY_VALUE_ARRAY_SCHEMA,
                headers: KEY_VALUE_ARRAY_SCHEMA,
                authType: { type: Type.STRING },
                bodyType: { type: Type.STRING },
                body: { type: Type.STRING },
              },
            },
          },
          required: ['message'],
        },
      },
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.text ?? '{}');
    } catch {
      parsed = { message: response.text ?? 'The model returned an unreadable response.' };
    }

    // Defence in depth: even if the model ignores rule 2, authConfig never
    // reaches the client.
    if (parsed.configUpdate && typeof parsed.configUpdate === 'object') {
      delete (parsed.configUpdate as Record<string, unknown>).authConfig;
    }

    res.json({ ...parsed, model: MODEL, source: 'ai' });
  } catch (err) {
    res.status(502).json({ error: (err as Error)?.message ?? 'AI chat assistant failed.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const proxyState =
      PROXY_ALLOWLIST.size === 0
        ? 'disabled (PROXY_ALLOWED_HOSTS unset)'
        : PROXY_ALLOWLIST.has('*')
          ? 'enabled for all public hosts'
          : `enabled for ${PROXY_ALLOWLIST.size} host pattern(s)`;
    console.log(`Endpointer server running on http://localhost:${PORT}`);
    console.log(`  AI:    ${aiEnabled() ? `enabled (${MODEL})` : 'disabled (GEMINI_API_KEY unset)'}`);
    console.log(`  Proxy: ${proxyState}`);
  });
}

startServer();
