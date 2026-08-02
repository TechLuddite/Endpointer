# ⚡ Endpointer

> **A browser-native API client, with a public API directory that verifies itself.**

[![CI](https://github.com/TechLuddite/Endpointer/actions/workflows/ci.yml/badge.svg)](https://github.com/TechLuddite/Endpointer/actions/workflows/ci.yml)
[![Health check](https://github.com/TechLuddite/Endpointer/actions/workflows/health-check.yml/badge.svg)](https://github.com/TechLuddite/Endpointer/actions/workflows/health-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Live:** [endpointer.opsvibe.systems](https://endpointer.opsvibe.systems)

Build a request, run it, generate code for it in eight languages, assert on the
response — then share the whole thing as a single link. No account, no install,
no server required.

---

## ✨ What it does

- 🛠️ **Request builder** — methods, query params, headers, bearer/basic/API-key
  auth, JSON and raw bodies. The URL bar and the params table are one source of
  truth kept in sync both ways, so unticking a parameter actually removes it.
- 🔗 **Shareable request links** — every request encodes into its own URL. Paste
  it into a bug report and the other person gets your exact setup. Credentials
  are deliberately excluded.
- 📋 **Paste a `curl` command** and it becomes an editable request — including
  anything you copied from browser devtools. Also imports Postman v2.1
  collections, OpenAPI 3 documents and HAR captures.
- ✅ **Assertions & a collection runner** — attach checks to a request (status,
  latency, headers, JSONPath), run a whole collection, get a pass/fail report.
  Assertions can be derived from a real response with one click.
- 🌐 **Environments & variables** — `{{baseUrl}}`, `{{token}}`, resolvable
  through each other. Values marked secret are swapped for placeholders on
  export.
- 📚 **58 public APIs, re-verified daily** — a scheduled job probes every entry
  for reachability *and* browser (CORS) usability, and commits the results.
- 📊 **Health board** — real uptime, p50/p95 latency and a 90-day sparkline from
  those scheduled runs, rendered on first paint with zero client-side requests.
- 💻 **Code generation** — `fetch`, `axios`, `cURL`, Python, Node, Go, Rust, PHP.
- 🔍 **Response inspector** — collapsible JSON tree, JSONPath filtering, image
  and HTML preview, and a structural diff against the previous run of the same
  request.
- 🤖 **Optional AI copilot** — builds requests, generates TypeScript/Zod/Python
  types from your *actual* response, and explains errors from the real body.
  Needs a Gemini API key; when there isn't one the UI says so plainly and falls
  back to a clearly-labelled offline helper. It never presents non-AI output
  as AI, and it will not invent a credential.
- ⌨️ **Keyboard-first** — `⌘/Ctrl+Enter` sends, `⌘/Ctrl+K` opens the palette,
  `Esc` closes dialogs.

---

## 🚀 Quick start

Requires **Node.js 20+**.

```bash
git clone https://github.com/TechLuddite/Endpointer.git
cd Endpointer
npm install
npm run dev          # http://localhost:3000
```

No environment variables needed. To enable the optional server-backed features,
copy `.env.example` to `.env`:

| Variable | Enables |
| --- | --- |
| `GEMINI_API_KEY` | The AI copilot. Without it, `/api/ai-*` return 503 and the UI reports "AI offline". |
| `PROXY_ALLOWED_HOSTS` | The CORS proxy, for the hosts you list. **Empty disables it** — it does not default to open. |
| `VITE_PROXY_URL` | Points the static build at a deployed [Worker proxy](./worker/README.md). |

```bash
npm run check         # typecheck + lint + 231 tests
npm run build:static  # static bundle for any static host
npm run build         # static bundle + the Node server
```

---

## 🌐 About CORS (read this before filing a bug)

Endpointer runs in your browser, so it is bound by the same-origin policy. If a
target API does not send `Access-Control-Allow-Origin`, **the browser** blocks
the response. No client-side tool can work around that.

Endpointer is explicit about it rather than pretending otherwise:

- Every directory entry carries a **verified** badge refreshed daily by
  [`health-check.yml`](.github/workflows/health-check.yml) — 🟢 browser-ready,
  🟡 needs a proxy, ⚪ needs your own API key, 🔴 unreachable — and you can
  filter to browser-ready only.
- Failures distinguish CORS from DNS failure, timeout, TLS error and offline,
  instead of labelling everything "CORS".
- For the 🟡 cases: run `npm run dev` locally (the bundled server proxies for
  you), deploy the included [Cloudflare Worker](./worker/README.md) and set
  `VITE_PROXY_URL`, or copy the generated cURL snippet and run it outside the
  browser.

The proxy toggle is disabled, with an explanation, when no proxy exists on the
deployment you are using. Deploying the Worker for the hosted site is
[the top backlog item](./docs/BACKLOG.md).

---

## 🏗️ Architecture

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Tailwind CSS v4, Vite 8, lucide-react |
| Optional server | Node + Express — CORS proxy and Gemini endpoints |
| Optional edge proxy | Cloudflare Worker with a hostname allowlist (`worker/`) |
| Optional AI | `@google/genai`, Gemini 3.6 Flash |
| Data pipeline | GitHub Actions cron → `public/status.json` |
| Tests | Vitest + Testing Library |

Persistence is `localStorage` only, behind a validated, versioned schema with a
migration. No backend database, no accounts.

---

## 🛡️ Security & privacy

- The bundled proxy refuses any host outside `PROXY_ALLOWED_HOSTS`, and refuses
  private, loopback, link-local, CGNAT and cloud-metadata addresses
  unconditionally — checked at connect time, so DNS rebinding does not slip
  past, and re-checked on every redirect hop.
- Credentials are **redacted before any AI request leaves your machine**, and
  stripped from model output on the way back. There are tests asserting this.
- Share links and collection exports exclude credentials by default.
- Per-IP rate limiting on the proxy, batch ping and AI endpoints.
- No analytics, no tracking cookies, no telemetry.

Details in [PRIVACY.md](./PRIVACY.md). Report vulnerabilities via
[GitHub issues](https://github.com/TechLuddite/Endpointer/issues).

---

## 📖 Documentation

| Document | What's in it |
| --- | --- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | How it fits together, and the invariants worth not breaking |
| [`docs/LESSONS-FROM-AI-STUDIO.md`](./docs/LESSONS-FROM-AI-STUDIO.md) | What the AI-generated first version got wrong, and how to catch it next time |
| [`docs/BACKLOG.md`](./docs/BACKLOG.md) | Deferred work, with enough context to pick up cold |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | House rules, and how to add an API |
| [`worker/README.md`](./worker/README.md) | The optional edge proxy |
| [`PRIVACY.md`](./PRIVACY.md) | What leaves your machine |

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Adding an API to the directory is a
single object in `src/data/publicApis.ts` — the scheduled check verifies it and
opens an issue if it later breaks.

## 💖 Support

Endpointer is free and MIT-licensed, with no paid tier. The **Support** button
in the footer has ways to say thanks; starring the repository helps most.

## 📄 License

[MIT](./LICENSE) © TechLuddite
