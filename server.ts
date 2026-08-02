import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proxy route to bypass browser CORS when testing APIs
app.post("/api/proxy", async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { url, method = "GET", headers = {}, params = {}, body, timeout = 15000 } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "A valid target 'url' string is required." });
      return;
    }

    // Construct full URL with query parameters
    const targetUrl = new URL(url);
    if (params && typeof params === "object") {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          targetUrl.searchParams.append(key, String(value));
        }
      });
    }

    // Prepare request headers (exclude host header to avoid host mismatches)
    const forwardHeaders: Record<string, string> = {};
    if (headers && typeof headers === "object") {
      Object.entries(headers).forEach(([k, v]) => {
        const lowerKey = k.toLowerCase();
        if (lowerKey !== "host" && lowerKey !== "content-length") {
          forwardHeaders[k] = String(v);
        }
      });
    }

    // Set User-Agent if not present
    if (!forwardHeaders["user-agent"] && !forwardHeaders["User-Agent"]) {
      forwardHeaders["User-Agent"] = "Endpointer-API-Tester/1.0";
    }

    // Abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number(timeout) || 15000);

    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: forwardHeaders,
      signal: controller.signal,
    };

    if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method ?? "") && body !== undefined && body !== null) {
      if (typeof body === "object") {
        options.body = JSON.stringify(body);
        if (!forwardHeaders["content-type"] && !forwardHeaders["Content-Type"]) {
          (options.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      } else {
        options.body = String(body);
      }
    }

    const response = await fetch(targetUrl.toString(), options);
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const contentType = response.headers.get("content-type") || "";

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    let rawData: string | object;
    if (contentType.includes("application/json") || contentType.includes("application/ld+json")) {
      try {
        rawData = await response.json();
      } catch {
        rawData = await response.text();
      }
    } else {
      rawData = await response.text();
    }

    const sizeInBytes = typeof rawData === "string" ? Buffer.byteLength(rawData, "utf8") : Buffer.byteLength(JSON.stringify(rawData), "utf8");

    res.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: rawData,
      contentType,
      duration,
      sizeBytes: sizeInBytes,
      finalUrl: response.url,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    let errorMessage = err?.message || "Failed to fetch resource";
    if (err?.name === "AbortError") {
      errorMessage = "Request timed out after limit";
    }

    res.status(502).json({
      ok: false,
      status: 502,
      statusText: "Bad Gateway / Proxy Error",
      error: errorMessage,
      duration,
      data: null,
    });
  }
});

// Batch ping endpoint for status checking multiple APIs quickly
app.post("/api/ping-batch", async (req: Request, res: Response) => {
  const { urls } = req.body;
  if (!Array.isArray(urls)) {
    res.status(400).json({ error: "'urls' array is required." });
    return;
  }

  const results = await Promise.all(
    urls.map(async (item: { id: string; url: string; method?: string }) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        
        const resp = await fetch(item.url, {
          method: item.method || "HEAD",
          headers: { "User-Agent": "Endpointer-Ping/1.0" },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        return {
          id: item.id,
          url: item.url,
          status: resp.status,
          ok: resp.ok,
          latency: Date.now() - start,
          timestamp: Date.now(),
        };
      } catch (err: any) {
        return {
          id: item.id,
          url: item.url,
          status: 0,
          ok: false,
          error: err?.name === "AbortError" ? "Timeout" : "Unreachable",
          latency: Date.now() - start,
          timestamp: Date.now(),
        };
      }
    })
  );

  res.json({ results });
});

// AI Schema Analyzer & Mock Data Generator
app.post("/api/ai-analyze", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "GEMINI_API_KEY environment variable is not set." });
      return;
    }

    const { prompt, context } = req.body;
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = "You are an expert API Architect and Developer Tool Assistant. Analyze API response payloads, generate TypeScript interfaces, explain HTTP status codes, or auto-generate sample JSON request payloads cleanly and concisely.";
    
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        { role: "user", parts: [{ text: `${prompt}\n\nContext payload:\n${JSON.stringify(context, null, 2)}` }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.2,
      }
    });

    res.json({ result: response.text });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "AI Analysis failed." });
  }
});

// Interactive AI Chat Assistant endpoint for REST Playground
app.post("/api/ai-chat-assistant", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ error: "GEMINI_API_KEY environment variable is not set." });
      return;
    }

    const { messages = [], currentConfig = {}, responseContext = null } = req.body;
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = `You are Endpointer's AI API Copilot.
You assist developers in constructing API requests, exploring REST endpoints, setting up authentication, configuring query parameters or body payloads, and inspecting responses.

Current Playground Request State:
- Method: ${currentConfig.method || 'GET'}
- URL: ${currentConfig.url || ''}
- Params: ${JSON.stringify(currentConfig.params || [])}
- Headers: ${JSON.stringify(currentConfig.headers || [])}
- Auth Type: ${currentConfig.authType || 'No Auth'}
- Auth Config: ${JSON.stringify(currentConfig.authConfig || {})}
- Body Type: ${currentConfig.bodyType || 'none'}
- Body: ${currentConfig.body || ''}
${responseContext ? `- Latest Executed Response Payload: ${JSON.stringify(responseContext).slice(0, 1000)}` : ''}

Your Goal:
1. Understand the user's chat message in context.
2. If the user asks to configure an API request (e.g. "Build a query for getting a random pokemon", "Search for weather in Tokyo", "Add a bearer token", "Set method to POST with sample json body", "Add query parameter limit=10"), compute appropriate configuration updates.
3. For Pokémon queries specifically:
   - If user asks for random Pokémon: set URL to "https://pokeapi.co/api/v2/pokemon/" + (Math.floor(Math.random() * 151) + 1), method "GET".
   - If user asks for specific Pokémon (e.g. Pikachu, Charizard, Mewtwo, Ditto): set URL to "https://pokeapi.co/api/v2/pokemon/" + name.toLowerCase(), method "GET".
4. Provide a friendly conversational message explaining what you did or answering their question.
5. If configuration changes were made, describe them in \`actionSummary\` and populate \`configUpdate\`.

Return JSON strictly matching the response schema:
{
  "message": "text explanation for user",
  "actionSummary": "summary of config changes applied or empty string",
  "configUpdate": {
    "method": "GET | POST | PUT | DELETE | PATCH | HEAD | OPTIONS",
    "url": "full string URL",
    "params": [ { "key": "...", "value": "...", "enabled": true } ],
    "headers": [ { "key": "...", "value": "...", "enabled": true } ],
    "authType": "No Auth | API Key | Bearer Token | Basic Auth",
    "authConfig": { ... },
    "bodyType": "none | json | raw",
    "body": "..."
  }
}`;

    const promptText = `User conversation history:\n${messages.map((m: any) => `${m.sender.toUpperCase()}: ${m.text}`).join('\n')}\n\nPlease process the latest user request and provide appropriate response and config updates.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptText,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json",
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
                params: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      value: { type: Type.STRING },
                      enabled: { type: Type.BOOLEAN }
                    }
                  }
                },
                headers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      value: { type: Type.STRING },
                      enabled: { type: Type.BOOLEAN }
                    }
                  }
                },
                authType: { type: Type.STRING },
                authConfig: {
                  type: Type.OBJECT,
                  properties: {
                    apiKeyName: { type: Type.STRING },
                    apiKeyValue: { type: Type.STRING },
                    apiKeyIn: { type: Type.STRING },
                    bearerToken: { type: Type.STRING },
                    basicUsername: { type: Type.STRING },
                    basicPassword: { type: Type.STRING }
                  }
                },
                bodyType: { type: Type.STRING },
                body: { type: Type.STRING }
              }
            }
          },
          required: ["message"]
        }
      }
    });

    let jsonResult: any = { message: response.text };
    try {
      jsonResult = JSON.parse(response.text || '{}');
    } catch {
      // fallback
    }

    res.json(jsonResult);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "AI Chat Assistant failed." });
  }
});

// Vite Integration for dev & static serving for prod
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
