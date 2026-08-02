# Lessons from building Endpointer in Google AI Studio

Endpointer's first version was generated in Google AI Studio with Gemini. This
document records what that produced, what went wrong, and what to check next
time. It exists because the failures were **systematic**, not random — the same
half-dozen patterns explain nearly every defect found in the first review, and
they will recur on the next AI-generated project unless you know to look.

Everything below is a real example from this repository, with the commit that
fixed it.

---

## The headline

**The code was mostly fine. The claims about the code were not.**

That distinction matters, because it tells you where to spend review effort. The
component decomposition was sensible, the visual design was genuinely good, the
information architecture (directory → playground → health → collections) was
sound, and the breadth — 65 API entries, code generation for 8 languages — would
have taken a person days. Very little of it needed rewriting because it was
*badly written*.

What needed rewriting was everything that **asserted something the code did not
do**: the README, the privacy policy, the contributor guide, the status badges,
the loading messages, the metadata on 65 directory entries, and the AI copilot's
own description of itself.

A generator optimises for something that looks and reads like a finished
product. Prose that describes a finished product is much cheaper to produce than
a finished product, so the prose runs ahead of the code — and it does so
fluently and confidently, which is exactly what makes it hard to catch.

**Review generated projects for truthfulness first, quality second.**

---

## The patterns

### 1. Scaffolding that was never wired up

The generator produces the *shape* of a feature — state, a handler, a control,
a type — without the connective tissue that makes it do anything. It reviews as
complete.

| What it looked like | What it did |
| --- | --- |
| A "Filter JSON response fields…" input on the response panel | `jsonSearchFilter` was set on change and **never read** |
| A response tab union typed `'parsed' \| 'raw' \| 'headers' \| 'preview'` | No preview tab was ever rendered |
| `proxyActive={true}` threaded from `App` into `Header` | Never rendered anywhere |
| An `error` state in the AI modal | Only ever assigned `''` |

**How to catch it:** for every `useState`, confirm *both* the value and the
setter are used somewhere real. Enabling `noUnusedLocals` catches some of it;
the filter input was only caught by reading the component. A quick pass asking
"what happens if I type in this box?" for every input on screen finds the rest.

Fixed in `bfa696f`.

---

### 2. A "fallback" that is actually the primary path

The AI copilot called `/api/ai-chat-assistant` and, on failure, quietly fell
back to local keyword matching. On the deployment target — GitHub Pages, static,
no server — that endpoint **never existed**, so the fallback was 100% of
traffic. The "primary" path had never run in production even once.

Meanwhile the UI said *"AI Assistant is analyzing query context…"* and *"Powered
by Gemini AI Engine"* the entire time.

**How to catch it:** for every `try/catch` fallback, ask **"in the real
deployment, which branch runs?"** If the answer is "the fallback", then the
fallback *is* the product and must be described as such. Feature-detect once at
startup and tell the user what is actually available, rather than discovering it
per-request and hiding the answer.

Fixed in `d5d341c`. There is now a `/api/capabilities` probe, and the copilot
header reads either "AI connected · gemini-3.6-flash" or "AI offline · pattern
matching only".

---

### 3. Fabricated credentials

This is the one to take most seriously, because it is *actively harmful* rather
than merely wrong.

Ask the old copilot anything containing "auth" or "token" and it replied:

> "I've enabled **Bearer Token** authentication mode with a test API key."

…and inserted the literal string `sk_test_endpointer_bearer_token_99812` into
the user's request. An invented secret, presented as a real one, in a tool whose
whole job is handling credentials.

Separately, a third-party Harvard Art Museums API key was committed in the
directory data.

**How to catch it:** grep the source for key-shaped strings (`sk_`, `api_key=`,
long base64-ish literals) before anything ships. Then trace every path a
credential can take out of the process. In this codebase that meant discovering
that `authConfig` — bearer tokens, basic-auth passwords, API key values — was
being interpolated into the Gemini system prompt on **every** copilot message,
while `PRIVACY.md` stated credentials were "passed strictly to target
endpoints".

Fixed in `d5d341c`. Credentials are now redacted in both directions with tests
asserting it, and the offline helper has a test proving it cannot be made to
emit a credential under six different phrasings.

**Standing rule, now in `CONTRIBUTING.md`:** nothing in this project may
generate, fabricate or fill in a credential — not even a placeholder or "test"
one.

---

### 4. Confidently asserted external facts

The directory shipped 65 entries. Every single one said `cors: 'yes'` and
`https: true` — identical values the generator had no way to verify, on a field
that was never read by any component. Three entries pointed at hosts that **no
longer resolve in DNS** (CoinCap v2, the retired CoinDesk BPI endpoint,
`stoic.chainsplit.org`): plausible URLs from training data that had since died.

Later, once real verification existed, three more turned out to be dead or
permanently broken and one could not be made to work at all.

**How to catch it:** any generated dataset of external facts — URLs, capability
flags, version numbers, pricing, availability — is unverified by construction.
A human review pass does not fix this, because a human cannot eyeball 65 URLs
either. **Build a verification pipeline instead.**

Fixed across `d5d341c`, `99392d5`, `3667dc0`. `scripts/health-check.ts` now
probes every entry daily, measures CORS the way a browser would, publishes the
result to `public/status.json`, and opens an issue when something fails three
checks in a row. The `cors` field is seeded `'unknown'` and only ever filled in
by measurement.

The pipeline immediately proved its worth by catching two bugs in the *fixes*:
a keyed API answering 401 to a keyless probe was being counted as an outage
(which would have painted every keyed entry permanently red — the same class of
mistake as the hardcoded "100% uptime" it replaced), and the probe was ignoring
each entry's `defaultHeaders`, i.e. testing something other than what ships.

---

### 5. Documentation written from intent, not from code

Every generated `.md` file described what the project was *meant* to be:

- `README.md` led with **"Zero-CORS Proxy Engine"** as a headline feature. The
  hosted site is static; there was no proxy in production at all.
- `CONTRIBUTING.md` documented a `PublicApi` interface with `endpoint`,
  `sampleResponse` and `cors: 'Yes' | 'Proxy Needed' | 'No'`. **No such
  interface existed.** The real one was `PublicApiItem`, with different field
  names and lowercase enum values. Anyone following the guide would have
  produced a broken entry.
- `PRIVACY.md` stated credentials were never sent anywhere but the target API,
  while the code sent them to Google on every AI message.
- The README's category list and API count did not match the data, and its
  preview image pointed at `docs/preview.png`, which did not exist.

**How to catch it:** read generated docs as a **specification to verify**, not
as a description of the system. Every factual claim is a test case. Where a doc
and the code disagree, assume the doc is wrong.

Fixed in `fde523e`. `PRIVACY.md` now explicitly flags the two claims that were
contradicted, rather than quietly editing them.

---

### 6. The safety net was switched off, and reported success

The most dangerous single finding.

`package.json` had a `lint` script of `tsc --noEmit`, and **`@types/react` and
`@types/react-dom` were not installed at all**. Every `.tsx` file therefore
type-checked as `any`, `strict` was off, and `tsconfig.json` had no `include`.
`npm run lint` exited 0 unconditionally. `CONTRIBUTING.md` claimed "strict type
checking".

Proof it mattered: `PlaygroundAiChat.tsx` read `response.timeMs` on a type whose
field is `duration`. It rendered the literal text **"undefinedms"** in the UI,
and the type checker said nothing. Turning types on surfaced **33 real errors**
immediately.

**How to catch it:** **verify your verification.** Introduce a deliberate type
error, a deliberate lint violation and a deliberately failing test, and confirm
each one actually fails the build. A green check that cannot go red is worse
than no check, because it buys false confidence.

Fixed in `1b37404`.

---

### 7. Security defaults wide open

The generator optimises for "works in the demo", and the demo never has an
attacker.

`/api/proxy` accepted **any** URL from an unauthenticated request body and
returned the response verbatim. That is a server-side request forgery primitive:
anyone who could reach the server could read cloud instance metadata
(`169.254.169.254`), internal admin panels, or anything else on the host's
network — and use the host as an open forward proxy. `/api/ping-batch` took an
unbounded array through `Promise.all`, making it a request amplifier. The AI
endpoints had no rate limit, so anyone could drain the operator's Gemini
billing.

None of this is exotic. It is what you get when nobody asks the question.

**How to catch it:** enumerate every point where the server makes an outbound
request or accepts unauthenticated input, and ask what an attacker does with it.
Pay attention to anything that forwards a user-supplied URL.

Fixed in `d5d341c`, verified live against a running server.

---

### 8. Plausible-but-wrong code in less-common languages

The code generators emitted:

- **Rust:** `HeaderValue::from_static(runtime_value)` — `from_static` requires a
  `&'static str` and will not compile for a runtime value.
- **cURL:** request bodies wrapped in double quotes with only `"` escaped, so a
  body containing `$(...)`, a backtick or `$VAR` was **interpreted by the
  shell**. A user copying a generated snippet could execute a payload from an
  API response.
- **Basic auth:** raw `btoa()`, which throws `InvalidCharacterError` on any
  non-ASCII credential.

These are worse than ordinary bugs because the broken output *ships to the
user's terminal*, where the failure is confusing and, in the cURL case,
dangerous.

**How to catch it:** if your app generates code, actually compile or run a
sample of each language it emits. Confidence in generated output drops sharply
outside the most common languages.

Fixed in `bfa696f`, with tests pinning the shell quoting and the Rust output.

---

### 9. Two sources of truth for the same state

The URL bar parsed its query string into the params table but **left it in the
URL string too**, and `buildFullUrl` then appended the whole table back on top.
Every "Test endpoint" click sent each parameter twice:

```
?latitude=..&longitude=..&current_weather=true
 &latitude=..&longitude=..&current_weather=true&hourly=temperature_2m
```

The same split meant unticking a parameter did nothing, because it was still
sitting in the URL string.

This is a design error rather than a typo: both representations were reasonable
in isolation, and the generator built each without reconciling them. It survived
because the app looked correct — the duplication only showed up in the outbound
request.

**How to catch it:** when the same information exists in two places, find the
line of code that reconciles them. If there isn't one, that is the bug.

Fixed in `bfa696f`. `RequestConfig.url` now never contains a query string.

---

### 10. Unvalidated persisted data can brick the app permanently

Collection import accepted **any** JSON array with no validation and wrote it
straight to `localStorage`. Import one whose objects lacked a `requests` array
and `col.requests.length` threw during render — and because the bad value was
already persisted, it threw again on **every subsequent reload**. The only way
out was clearing site data from browser settings.

Relatedly, `saveHistoryItem` returned `[]` on any throw — including the quota
error you reliably hit while storing fifty full response bodies — so the caller
set history to empty and the user watched their history apparently vanish while
it was still on disk.

**How to catch it:** treat `localStorage`, imported files and URL parameters as
untrusted input, because they are. Validate on the way *out* of storage, not
just on the way in — the data may predate your current code, or have been
hand-edited.

Fixed in `bfa696f`. Everything crossing those boundaries goes through
`src/utils/validation.ts`, storage is versioned with a migration, and there is a
"delete local data" escape hatch in the app.

---

## Checklist for the next AI-generated project

Run through this before trusting anything:

**Verification**

- [ ] Do the type checker, linter and tests actually fail when they should?
      Introduce a deliberate error in each and confirm.
- [ ] Are the type packages for your framework actually installed?
- [ ] Does CI gate deployment, or does it deploy straight from a push?

**Truthfulness**

- [ ] Does every claim in the README exist in the code?
- [ ] Does every claim in the privacy policy match what the code sends?
- [ ] Does the contributor guide describe interfaces that actually exist?
- [ ] Does any badge, pill or status indicator show a hardcoded value?
- [ ] For every fallback path: which branch runs in the *real* deployment?

**Data**

- [ ] Is any generated dataset of external facts verified, or just asserted?
- [ ] Is there a pipeline to keep it verified, or will it rot silently?

**Security**

- [ ] Any endpoint that forwards a user-supplied URL? (SSRF)
- [ ] Any unauthenticated endpoint that costs money to call?
- [ ] Any unbounded loop over user-supplied input?
- [ ] Any committed keys? Any fabricated ones?
- [ ] Trace every path a user credential can take out of the process.

**Completeness**

- [ ] Every `useState`: are both the value and the setter used?
- [ ] Every input on screen: does typing in it do something?
- [ ] Every union member in a type: is each case handled?
- [ ] If the app generates code, does that code compile and run?

**State**

- [ ] Any information stored in two places? Where is it reconciled?
- [ ] Is persisted data validated on read?
- [ ] Can bad persisted data be recovered from inside the app?

---

## What to keep doing

None of this is an argument against generating the first version. It produced a
working, good-looking, broad application very quickly, and the parts that were
genuinely *engineering* — layout, component structure, state shape, the choice
of what screens to have — mostly held up.

The lesson is narrower and more actionable: **an AI-generated project arrives
with its documentation, status indicators and metadata already written as though
the work were finished.** Those are the artefacts to distrust, and they are
cheap to check once you know to check them.
