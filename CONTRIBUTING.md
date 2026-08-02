# 🤝 Contributing to Endpointer

Thanks for taking a look.

---

## Getting set up

Requires **Node.js 20+**.

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck + lint + tests — run this before opening a PR
```

`npm run check` is exactly what CI runs. If it passes locally, CI will pass.

| Command | Does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm run lint` | ESLint + Prettier check |
| `npm run lint:fix` | Fixes what it can |
| `npm run test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run health:check` | Probes every directory endpoint and rewrites `public/status.json` |

---

## House rules

**Strict TypeScript, actually enforced.** `strict`, `noUnusedLocals` and
`noUnusedParameters` are on. For a while this repo had no `@types/react`
installed at all, which silently made every `.tsx` file `any` and turned
`npm run lint` into a no-op. Please don't reintroduce an `any` where a real
type would do.

**Don't claim what the code doesn't do.** This is the thing we care about most.
If a feature depends on a backend, an API key, or a scheduled job that may not
have run, the UI has to say so — a disabled control with a tooltip, or an
explicit "not verified yet", never a hardcoded green badge. Two rules that came
out of real bugs:

- Output that did not come from a language model must never be labelled or
  styled as if it did.
- Nothing may generate, fabricate or fill in a credential — not even a
  placeholder or "test" one.

**Tests pin behaviour, not implementation.** Pure logic lives in `src/utils/`
and is directly testable; prefer putting it there over inside a component. When
you fix a bug, add the test that would have caught it.

**Validate anything crossing a boundary.** localStorage, imported files and
share links all go through `src/utils/validation.ts`. Unvalidated persisted data
once bricked the app permanently on every reload.

---

## Adding an API to the directory

Add one object to `PUBLIC_APIS` in `src/data/publicApis.ts`, matching the
`PublicApiItem` interface in `src/types.ts`:

```ts
{
  id: 'unique-slug',                     // stable; keys the health history
  name: 'Human Readable Name',
  category: 'weather',                   // an id from the list below
  description: 'One sentence on what it returns.',
  auth: 'No Auth',                       // 'No Auth' | 'API Key' | 'Bearer Token' | 'Basic Auth' | 'OAuth'
  https: true,
  cors: 'unknown',                       // always 'unknown' — see below
  baseUrl: 'https://api.example.com/v1',
  sampleEndpoint: 'https://api.example.com/v1/things?limit=5',
  defaultMethod: 'GET',
  defaultParams: [
    { key: 'limit', value: '5', description: 'How many to return' },
  ],
  documentationUrl: 'https://docs.example.com',
  tags: ['example', 'demo'],
}
```

Valid `category` ids: `weather`, `finance`, `dev`, `data`, `entertainment`,
`animals`, `quotes`, `news`, `food`, `art`, `geo`.

**Always write `cors: 'unknown'`.** Do not assert it. Every entry in this file
once claimed `cors: 'yes'` with nobody having checked. The value is measured by
`scripts/health-check.ts`, which sends an `Origin` header and inspects the
response, then publishes it to `public/status.json` for the UI to overlay at
runtime. The check runs daily and opens an issue if an endpoint fails three
times in a row.

Please prefer APIs that need no key, send CORS headers, and are unlikely to
disappear — three entries have already had to be removed for no longer
resolving in DNS.

You can verify your entry locally:

```bash
npm run health:check
```

That rewrites `public/status.json`; don't commit the result, since CI
regenerates it against the real network.

---

## Pull requests

1. Fork and branch: `git checkout -b feature/thing`
2. Make the change, with tests
3. `npm run check`
4. Open a PR describing what changed and why

Small, focused PRs get reviewed faster. If you're planning something large,
open an issue first so we can agree on the shape.
