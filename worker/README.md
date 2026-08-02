# Endpointer edge proxy

A Cloudflare Worker that lets Endpointer reach APIs which do not send CORS
headers, without running a server of your own.

## Why this exists

Endpointer runs in the browser. If a target API omits
`Access-Control-Allow-Origin`, the browser blocks the response and no
client-side code can change that. The Node server in `server.ts` proxies around
this during local development, but the hosted site is static — there is no
origin server to proxy through. This Worker is that origin.

## Deploy

```bash
cd worker
npm install -g wrangler        # if you do not have it
wrangler login
# Edit ALLOWED_HOSTS in wrangler.toml first — see the security note below.
wrangler deploy
```

Then rebuild the site with the Worker's URL baked in:

```bash
VITE_PROXY_URL="https://endpointer-proxy.<your-subdomain>.workers.dev" npm run build:static
```

For GitHub Pages, add `VITE_PROXY_URL` as a repository variable
(Settings → Secrets and variables → Actions → Variables) — `deploy.yml` reads it.

Endpointer probes the Worker's `/health` endpoint on load and enables the
"Server proxy" toggle only if it answers.

## Security

The Worker enforces the same policy as the bundled Node proxy:

- **Host allowlist.** `ALLOWED_HOSTS` is required. An empty value disables the
  proxy entirely rather than defaulting to open.
- **Address blocking.** Private, loopback, link-local, CGNAT, multicast and
  cloud-metadata targets are refused unconditionally, including via IPv4-mapped
  IPv6 and NAT64 forms.
- **Redirect re-validation.** Every hop is re-checked, so an allowlisted host
  cannot 302 you into `169.254.169.254`.
- **Bounded.** 5 MB response cap, 20 s timeout, 5 redirects.
- **Origin restriction.** `ALLOWED_ORIGINS` limits who may call it from a
  browser.
- **Optional shared secret.** `wrangler secret put PROXY_SECRET` requires an
  `X-Endpointer-Key` header on every request.

Setting `ALLOWED_HOSTS = "*"` makes this an open forward proxy for anyone who
can reach the URL. Set `PROXY_SECRET` if you do that, and keep in mind that
requests will appear to originate from Cloudflare's network under your account.

## Local test

```bash
cd worker && wrangler dev
curl -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"url":"https://pokeapi.co/api/v2/pokemon/pikachu"}'
```
