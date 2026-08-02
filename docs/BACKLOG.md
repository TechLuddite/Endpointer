# Backlog

Deliberately deferred work, with enough context to pick up cold. Ordered by
value, not effort.

---

## 1. Deploy the Cloudflare Worker proxy ⭐ highest value

**Status:** code is written and reviewed; not deployed.

The Worker in [`worker/`](../worker/) is complete and enforces the same policy
as the Node proxy — hostname allowlist, unconditional blocking of
private/loopback/link-local/metadata addresses, redirect re-validation, size and
timeout caps, optional shared secret. It has never been deployed, so
`VITE_PROXY_URL` is unset and the hosted site runs direct-fetch only.

**Why it matters:** the last health run had 53 of 58 entries browser-reachable
and 2 reachable-but-CORS-blocked. Those 2 are permanently unusable on the live
site today, and the proxy toggle is disabled with an explanatory tooltip. This
is the one remaining feature where the UI has to tell users it cannot do
something.

**To do it:**

```bash
cd worker
# Edit ALLOWED_HOSTS in wrangler.toml first — see the security note in its README
wrangler login
wrangler deploy
```

Then add `VITE_PROXY_URL` as a **repository variable** (Settings → Secrets and
variables → Actions → Variables) pointing at the deployed Worker URL.
`deploy.yml` already reads it; the next deploy picks it up and the toggle
becomes live. `capabilities.ts` probes the Worker's `/health` endpoint, so if
the Worker is down the UI correctly reports the proxy as unavailable rather than
offering a broken control.

**Do not set `ALLOWED_HOSTS = "*"` without also setting `PROXY_SECRET`.** That
combination is an open forward proxy running under your Cloudflare account.
Start with the handful of hosts the directory actually needs a proxy for — the
health data tells you which (`needsProxy` entries in `public/status.json`).

---

## 2. Playwright end-to-end tests in CI

**Status:** deliberately skipped.

The 231 tests cover pure logic thoroughly and the Playground component
reasonably. Full browser tests were verified manually during the rebuild
(routing, share links, URL/param sync, assertions, Escape-to-close) but not
automated, because Playwright in CI needs browser downloads and adds real
fragility for a project this size.

Worth adding if the app grows a second contributor. The manual script used
during the rebuild is a reasonable starting point: load each tab, send a
request, round-trip a share link, open and Escape out of each dialog.

---

## 3. Response streaming for large payloads

`JsonViewer` renders lazily — a collapsed branch costs nothing — and caps
children per node, so multi-megabyte responses no longer freeze the tab. But the
whole body is still read into memory as a string before parsing. A genuinely
huge response (100 MB+) will still hurt.

Only worth doing if someone actually hits it.

---

## 4. Directory entries currently failing

From the last scheduled run, four entries are failing with transient upstream
conditions on APIs that are alive:

| Entry | Symptom |
| --- | --- |
| `httpbin` | 503 / intermittent timeouts — httpbin.org is chronically flaky |
| `spacex-launches` | Cloudflare 525 (SSL handshake failed at the edge) |
| `spacex-rockets` | Cloudflare 525 |
| `jikan-anime` | 504 |

**No action needed right now.** The pipeline files and updates a
`directory-health` issue automatically once something crosses three consecutive
failures — see [issue #2](https://github.com/TechLuddite/Endpointer/issues/2).
If any of these stay red for a week, prune them the way `teleport-urban`,
`openaq-air`, `nasa-mars-rover` and `reqres-in` were pruned.

**`reqres-in` note:** it was removed rather than fixed. ReqRes began requiring an
`x-api-key` header in 2025; the documented free value (`reqres-free-v1`) was
added and the probe was confirmed to send it, but the endpoint still returned
401 from the CI runner. The cause could not be determined from a
network-restricted environment — the published key may have changed, or it may
be IP-restricted. If you can reproduce a working request locally, the entry is
easy to restore.

---

## 5. Smaller ideas, unranked

- **Chained requests** — use a value from one response as input to the next
  (`{{$prev.body.id}}`). The assertion engine's JSONPath already does the hard
  part.
- **Request history search** — history is stored and rendered but not
  searchable.
- **Collection-level variables** — currently variables are environment-scoped
  only.
- **GraphQL body mode** — a query/variables editor rather than raw JSON.
- **Export a collection as a GitHub Action** — the collection runner already
  produces pass/fail; emitting a workflow that runs it on a schedule is a small
  step and makes the assertions useful outside the browser.
- **Dark/light theme** — currently dark only, which is a deliberate choice, but
  the palette is already tokenised enough to make a light mode cheap.

---

## Explicitly not doing

- **Accounts or server-side sync.** The absence of a backend is the point.
  `localStorage` only, no telemetry.
- **Bundling a hosted proxy for everyone.** Running an open proxy on behalf of
  strangers is an abuse liability. The Worker is there for operators to deploy
  under their own account, with their own allowlist.
- **Shipping credentials in share links**, under any "convenience" framing.
