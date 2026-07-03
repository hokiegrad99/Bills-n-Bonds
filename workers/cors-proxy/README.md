# bills-n-bonds-cors-proxy

A 12-line Cloudflare Worker that proxies any upstream URL and stamps
`Access-Control-Allow-Origin: *` so the browser can read it cross-origin.

This is the self-hosted fallback that replaces the dead public proxies
(`corsproxy.io`, `api.allorigins.win`) the app used to rely on.

## Deploy

```bash
cd workers/cors-proxy
npx wrangler deploy
```

`wrangler` will print the deployed URL, e.g.

```
Published bills-n-bonds-cors-proxy
  https://bills-n-bonds-cors-proxy.<your-account>.workers.dev
```

## Wire into the app

Open `src/lib/treasury-api.ts` and update the `CORS_PROXY_URL` constant:

```ts
const CORS_PROXY_URL = 'https://bills-n-bonds-cors-proxy.<your-account>.workers.dev/?url=';
```

substituting `<your-account>` with the value `wrangler deploy` printed (or
customising the worker name in `wrangler.toml` first).

## Test

```
curl -sS 'https://bills-n-bonds-cors-proxy.<your-account>.workers.dev/?url=https%3A%2F%2Fapi.fiscaldata.treasury.gov%2Fservices%2Fapi%2Ffiscal_service%2Fv2%2Ftvmt%2Fyield_curve%3Fsort%3D-new_date%26page%5Bsize%5D%3D2' | head -c 200
```

## Limits

Cloudflare Workers free tier: 100,000 requests/day, 10ms CPU time per
request. Sufficient for a single-user personal-finance app.
