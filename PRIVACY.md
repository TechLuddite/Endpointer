# 🔒 Endpointer privacy policy

**Last updated:** 2 August 2026

Endpointer is an API client that runs in your browser. This document describes
exactly what leaves your machine and what does not. Where a previous version of
this policy described behaviour the code did not implement, it has been
corrected — those corrections are noted.

---

## 1. Local storage

Collections, request history, favourites and environment variables are stored
in your browser's `localStorage` and nowhere else. There is no account system,
no server-side database, and no sync between devices.

You can delete all of it at any time from **Privacy → Delete local data** in
the app, or by clearing site data in your browser.

---

## 2. Where your requests go

**By default, nowhere but the target API.** Requests are issued directly by your
browser to the endpoint you entered. Endpointer's operators cannot see them.

**If you enable the proxy toggle**, the request is relayed by whichever proxy is
configured for the deployment you are using — the bundled Node server when you
run Endpointer locally, or a Cloudflare Worker if one is deployed. The proxy
forwards the request and returns the response. It does not store either. The
proxy is disabled entirely unless an explicit hostname allowlist is configured,
and it refuses private, loopback, link-local and cloud-metadata addresses
unconditionally.

The app shows which mode is active; the toggle is disabled when no proxy exists.

---

## 3. Credentials

Anything you type into the Auth tab — bearer tokens, API keys, basic-auth
credentials — stays in your browser and is sent only to the target API (or the
proxy, if you enabled it).

Specifically, credentials are **removed before**:

- **any AI request.** Auth values, `Authorization` and `Cookie` headers,
  credential-shaped query parameters and URL userinfo are replaced with
  `[redacted]` before the request reaches the model, and credential fields are
  stripped from the model's response on the way back. There are automated tests
  asserting this.
- **share links.** A link encodes the request shape — method, URL, parameters,
  non-credential headers, body, assertions — and never a credential value. The
  recipient supplies their own.
- **collection exports**, by default. Values declared secret in an environment
  are swapped for their `{{placeholder}}`, and auth fields are replaced with
  placeholders regardless. You can opt out of this per export.

> **Correction to a previous version:** an earlier release of Endpointer sent
> the full auth configuration to the Gemini API on every copilot message, while
> this document stated credentials were "passed strictly to target endpoints".
> That was a defect. It is fixed, and covered by tests.

---

## 4. AI features

The AI copilot is **optional and off unless the deployment has a Gemini API key
configured.** When it is enabled, your prompt, your redacted request
configuration and the redacted response payload are sent to Google's Gemini API
for processing. Endpointer does not log or retain prompts or completions.

When AI is **not** configured, the interface says so and uses a local pattern
matcher instead. That fallback is always visibly labelled as not being a
language model.

> **Correction to a previous version:** the copilot used to fall back to this
> local matcher silently while the interface continued to say it was "analyzing
> with Gemini", and it would answer questions about authentication by inventing
> a fake bearer token and inserting it into your request. Both are fixed. The
> offline helper now refuses to produce credentials at all.

### Things to keep in mind

1. **Don't put real secrets in a prompt or request body.** Redaction covers
   recognised credential fields; it cannot recognise a secret pasted into free
   text. Use mock data.
2. **AI output is probabilistic.** Review generated requests, types and
   assertions before running them against anything that matters.
3. **Share links are readable by anyone who has them.** They contain no
   credentials, but they do contain your URL, parameters and body.

---

## 5. Analytics

There are none. No analytics scripts, no tracking cookies, no telemetry, no
error reporting service, no fingerprinting. The only network requests
Endpointer makes on its own are for `status.json` (the committed health data)
and a one-time capability probe of its own server.

---

## 6. Contact

Open an issue at
[github.com/TechLuddite/Endpointer](https://github.com/TechLuddite/Endpointer/issues),
or email [opsvibe.systems@gmail.com](mailto:opsvibe.systems@gmail.com).
