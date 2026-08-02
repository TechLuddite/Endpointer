# Endpointer architecture

A map of how the project fits together, and the invariants worth knowing before
you change anything.

---

## Shape of the thing

Endpointer is a **client-side application** with two optional server pieces. The
distinction matters constantly, because most of the design follows from it.

```
┌─────────────────────────────────────────────────────────┐
│  Browser (this is the whole product)                    │
│  React 19 · TypeScript strict · Tailwind v4 · Vite 8    │
│  Persistence: localStorage only                          │
└────────────┬─────────────────────────┬──────────────────┘
             │                         │
      direct fetch                 optional proxy
             │                         │
             ▼                         ▼
      ┌─────────────┐        ┌──────────────────────┐
      │ Target API  │        │ server.ts (local) or │
      │ (CORS-      │        │ worker/ (edge)       │
      │  permitting)│        │ + Gemini endpoints   │
      └─────────────┘        └──────────────────────┘

      ┌──────────────────────────────────────────────┐
      │ GitHub Actions cron → public/status.json     │
      │ (the directory's health & CORS data)         │
      └──────────────────────────────────────────────┘
```

The hosted deployment at `endpointer.opsvibe.systems` is **static**. There is no
origin server there unless a Worker proxy has been deployed and
`VITE_PROXY_URL` set at build time. The app discovers this at runtime and says
so — see *Capability detection* below.

---

## Directory layout

```
src/
  types.ts                 All shared types. Start here.
  App.tsx                  Shell: state, routing, wiring. No business logic.
  hooks/
    useHashRoute.ts        Hash routing (#/playground?r=…)
  components/              Presentational + local interaction only
    Playground.tsx         The request builder (largest component)
    PlaygroundAiChat.tsx   Copilot panel
    ApiDirectory.tsx       Directory grid; owns configFromApi()
    StatusMonitor.tsx      Health board
    CollectionsManager.tsx Collections, history, import/export, runner
    JsonViewer.tsx         Collapsible tree + response preview
    Modal.tsx              Accessible dialog base — use this, never a bare div
    CommandPalette.tsx     ⌘K
    KeyValueTable.tsx      Shared params/headers editor
    EnvironmentManager.tsx Variables & secrets
    Toasts.tsx             Notifications (replaced alert())
  utils/                   Pure logic. Testable without React. Prefer here.
    requestUrl.ts          URL ⇄ params reconciliation  ← read this one
    codeGenerators.ts      8-language snippet generation
    execute.ts             Request execution, timeout, error classification
    validation.ts          Boundary validation (storage/import/share links)
    storage.ts             Versioned localStorage with migration
    variables.ts           {{placeholder}} interpolation, secret stripping
    assertions.ts          Assertion evaluation + JSONPath
    diff.ts                Structural response diff
    typeInference.ts       TS/Zod/Python types from a real payload
    curlParser.ts          Shell tokeniser + curl → RequestConfig
    importers.ts           Postman v2.1 / OpenAPI 3 / HAR
    shareLink.ts           Request ⇄ URL encoding
    capabilities.ts        Runtime feature detection
    status.ts              Reads public/status.json
    offlineAssistant.ts    Non-AI fallback (must never claim to be AI)
  server/                  Node-only, imported by server.ts
    ssrf.ts                Address/host validation  ← security critical
    safeRequest.ts         Outbound HTTP with connect-time address pinning
    rateLimit.ts           Per-IP fixed window
    redact.ts              Credential scrubbing  ← security critical

server.ts                  Express app (dev server + optional prod server)
worker/                    Cloudflare Worker proxy (same policy as server.ts)
scripts/health-check.ts    The directory verification pipeline
public/status.json         Committed health data. Written by CI, not by hand.
```

**Rule of thumb:** if logic can live in `src/utils/`, put it there. Components
should be thin enough that their tests are about rendering and interaction, not
about correctness of computation.

---

## Invariants

These are load-bearing. Breaking one reintroduces a bug that has already
shipped once.

### 1. `RequestConfig.url` never contains a query string

Query parameters live **only** in `config.params`. `buildFullUrl()` recombines
them. Keeping them in both places is what made every request send its parameters
twice and made unticking a parameter row do nothing.

The URL bar keeps a separate *draft* string (`urlDraft` in `Playground.tsx`) so
that typing does not round-trip through split/join on each keystroke and fight
the user mid-word. It settles on the canonical form on blur.

See `src/utils/requestUrl.ts` and its tests.

### 2. Nothing reaches React state or `localStorage` unvalidated

Storage reads, file imports and share-link decoding all go through
`src/utils/validation.ts`, which **coerces rather than rejects** — a slightly-off
Postman export still imports, but nothing structurally dangerous gets through.
Unvalidated persisted data previously bricked the app on every reload.

Storage is versioned (`SCHEMA_VERSION` in `storage.ts`) with a migration path,
and there is a user-facing reset in the privacy dialog.

### 3. Credentials never leave the browser except to the target API

Enforced in three places:

- `src/server/redact.ts` — before any AI request, and again on the model's
  response.
- `src/utils/shareLink.ts` — auth values and credential-shaped headers are
  excluded from encoded links.
- `src/utils/variables.ts` — `stripSecrets()` on collection export.

There are tests for each. If you add a new outbound path for request data, add
redaction and a test with it.

### 4. Nothing may fabricate a credential

Not the AI (system prompt forbids it, and `authConfig` is stripped from model
output regardless), not the offline helper (tested against six phrasings), not
the fixtures. An auth request sets the *mode* and tells the user to supply the
value.

### 5. The UI states what is actually available

`src/utils/capabilities.ts` probes `/api/capabilities` and the optional Worker
once at startup. Everything that depends on a server — the proxy toggle, the
copilot header, the footer — reads from that, and the proxy toggle is *disabled
with an explanation* when no proxy exists.

A static host answers unknown paths with `index.html`, so a `200` alone does not
prove an endpoint exists — the content type is checked too.

### 6. `cors` is measured, never asserted

`PublicApiItem.cors` is seeded `'unknown'` in the source data and overlaid at
runtime from `public/status.json`. Only `scripts/health-check.ts` may decide
its value. Do not hand-write `'yes'`.

### 7. The proxy is closed by default

`PROXY_ALLOWED_HOSTS` empty ⇒ proxy disabled. Private, loopback, link-local,
CGNAT and cloud-metadata addresses are refused unconditionally, checked *inside
the DNS lookup passed to the agent* so the validated address is the one the
socket connects to, and re-validated on every redirect hop.

---

## Data flow: sending a request

```
Playground state (RequestConfig)
      │
      ├─ applyVariables()      resolve {{placeholders}} from the environment
      ▼
App.runRequest()
      │
      ├─ executeRequest()      utils/execute.ts
      │     ├─ direct fetch    (default)
      │     └─ via proxy       (only if capabilities say one exists)
      │     └─ classifyFetchError()  cors | dns | timeout | tls | offline | …
      ▼
ApiResponseData
      ├─ evaluateAssertions()  results attach to the response
      ├─ saveHistoryItem()     quota-aware; sheds bodies before dropping entries
      └─ diffPayloads()        against the previous run of the same request
```

`execute()` takes the config **as an argument**. It does not read component
state. The copilot's auto-send previously used `setTimeout(handleExecute, 300)`
and hoped React had re-rendered, which could send the previous configuration.

---

## The health pipeline

This is what keeps the directory honest, so treat changes to it with the same
care as changes to the proxy.

```
.github/workflows/health-check.yml   daily cron (06:17 UTC) + manual dispatch
  └─ scripts/health-check.ts
       ├─ probes every PUBLIC_APIS entry **as the app would send it**
       │    (including its defaultHeaders — testing anything else is worse
       │     than not testing, because the result looks authoritative)
       ├─ sends an Origin header to classify CORS the way a browser would
       ├─ classifies 401/403 on a keyed entry as needsCredentials, not failure
       ├─ merges into 90 days of history, computes uptime and p50/p95
       └─ writes public/status.json
  └─ commits the result
  └─ opens/updates a `directory-health` issue for 3+ consecutive failures
```

The committed file means the board renders real history on first paint with zero
client requests — which also covers endpoints a browser could never reach.

`loadStatusFile()` treats an empty `entries` array as "no data", so the seed file
in the repo does not produce a fake 0% uptime.

---

## Testing

231 tests, `npm run check` runs the lot (typecheck + lint + test).

- **Pure logic** in `src/utils/*.test.ts` — the bulk, and where new logic should
  go.
- **Security** in `src/server/ssrf.test.ts` and `redact.test.ts` — address
  blocklist boundaries, allowlist suffix-matching (`api.example.com` must not
  match `api.example.com.attacker.tld`), and the guarantee that no credential
  survives sanitisation.
- **Component** in `src/components/Playground.test.tsx` — pins the parameter
  duplication bug, the disabled proxy toggle, cancellation, error
  classification, and the copilot's offline labelling.

`src/test/setup.ts` stubs `scrollIntoView` and `navigator.clipboard`, which jsdom
does not implement.

When you fix a bug, add the test that would have caught it. Several tests here
exist specifically to stop a shipped defect from returning; their names say so.

---

## Deployment

- **`ci.yml`** — typecheck, lint, test, build on every PR and push to main.
- **`deploy.yml`** — `npm ci`, then `npm run check` as a gate, then build and
  publish to Pages. It previously deployed straight from a push with no
  verification.
- **`health-check.yml`** — the pipeline above.

`vite.config.ts` resolves the base path from the Pages action's outputs, which
is what makes a custom domain and a project page both work. There is a comment
there explaining why "defined but empty" must not be treated as unset — getting
that wrong produced a white screen.

---

## Further reading

- [`LESSONS-FROM-AI-STUDIO.md`](./LESSONS-FROM-AI-STUDIO.md) — why several of
  these invariants exist.
- [`BACKLOG.md`](./BACKLOG.md) — what is deliberately not done yet.
- [`../worker/README.md`](../worker/README.md) — the edge proxy.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — house rules and how to add an API.
