# bills-n-bonds-cors-proxy

A small Cloudflare Worker that fronts the **US Treasury Fiscal Data API** and the **St. Louis Fed (FRED) API** with `Access-Control-Allow-Origin: *` so the browser can read them cross-origin. The FRED API key is stored as a Cloudflare secret and injected server-side; it never reaches the browser.

This worker replaces the dead public proxies (`corsproxy.io`, `api.allorigins.win`) the app used to fall back on, and unblocks live data on GitHub Pages (where the Treasury/FRED APIs do not return CORS headers to direct browser fetches).

## Routes

| Method | Path | Effect |
|---|---|---|
| `GET`  | `/fred/*`                      | forwards to `api.stlouisfed.org`, auto-injects `api_key` from `FRED_API_KEY` secret |
| `GET`  | `/treasury/*`                  | forwards to `api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/...` |
| `GET`  | `/?url=<absolute upstream>`    | generic passthrough (legacy fallback for absolute URLs) |
| `GET`  | `/`                            | JSON descriptor for sanity checks (`{ ok, worker, routes, fredApiKeyConfigured }`) |
| `OPTIONS` | any                        | 204 with `ACAO: *` so any future client can preflight cleanly |

## End-to-end deploy (≈ 10 minutes, all-free)

1. **Sign up at Cloudflare** (free, no card required):
   <https://dash.cloudflare.com/sign-up>

2. **Get a free FRED API key** (~2 minutes):
   <https://fred.stlouisfed.org/docs/api/api_key.html>

3. **Deploy the worker**:

   ```bash
   cd workers/cors-proxy
   npm install                            # pulls wrangler + types
   npx wrangler login                     # one-time, opens browser for OAuth
   npx wrangler secret put FRED_API_KEY   # paste your FRED key
   npx wrangler deploy                    # prints your worker URL
   ```

   The URL looks like `https://bills-n-bonds-cors-proxy.<your-subdomain>.workers.dev`.

4. **Wire it into the bill's-n-bonds build** — set the URL as a GitHub Actions repo secret:

   - Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VITE_CORS_PROXY_URL`
   - Value: `https://bills-n-bonds-cors-proxy.<your-subdomain>.workers.dev`
     (no trailing slash)

5. **Push any commit** (or re-run the existing Pages workflow from the Actions tab). The next build embeds the URL, and the Yields / Research / Auctions pages switch from clearly-labeled synthetic fallback to **live** Treasury + FRED data.

## Sanity-check the deployed worker

```bash
# Quick liveness:
curl -sS https://bills-n-bonds-cors-proxy.<sub>.workers.dev/

# → {"ok":true,"worker":"bills-n-bonds-cors-proxy",
#    "routes":["/fred/*","/treasury/*","/?url=<target>"],
#    "fredApiKeyConfigured":true}

# Real Treasury data through the proxy:
curl -sS 'https://bills-n-bonds-cors-proxy.<sub>.workers.dev/treasury/accounting/od/auctions_query?sort=-auction_date&page%5Bsize%5D=1' | head -c 300

# Real FRED data through the proxy (now responses carry ACAO):
curl -sSI 'https://bills-n-bonds-cors-proxy.<sub>.workers.dev/fred/fred/series/observations?series_id=DGS10&file_type=json&sort_order=desc&limit=1' | grep -i 'access-control'
```

If `fredApiKeyConfigured` shows `false`, re-run `npx wrangler secret put FRED_API_KEY` for the right worker (the `dev`/`production` environment split is automatic; verify with `npx wrangler secret list`).

## Limitations

- **Cloudflare Workers free tier**: 100,000 requests/day, 10ms CPU per request. Sufficient for any single-user personal-finance tracker.
- **Treasury Fiscal Data** has some endpoints whose GET responses sometimes drop ACAO (especially under load). The proxy helps, but if a corporate firewall still blocks `api.fiscaldata.treasury.gov`, the rates cache layer will silently fall back to its modeled reference values and surface that via the global `ApiFallbackBanner`.
- **FRED API rate limit**: 120 requests / minute per key. The bills-n-bonds app batches ~30 series per refresh and caches for 6h, so this is well within bounds.
