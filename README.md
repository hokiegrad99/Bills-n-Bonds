# Bills n' Bonds

A privacy-first, client-only tracker for **US Treasury Bills, Notes, Bonds, TIPS and CDs**. Everything runs in your browser — no server, no signup, no telemetry. Drop the built site on GitHub Pages, Netlify, Vercel or any static host for free.

## Features

- **Dashboard** — KPI tiles, allocation donut, term-bucket bar chart, 12-month cash-flow projection, upcoming maturities, recent activity, scheduled reinvestments.
- **My Holdings** — Full CRUD across all 16 spec fields (security type, institution, term, CUSIP, dates, face value, yield, interest, tax year, state-tax-exempt, status, auto-reinvest, notes…). Toggle hides matured holdings, search, type filter. Import / Export CSV with a copyable sample.
- **Ladder Planner** — Cash-flow projection from your existing holdings, full maturity calendar, plus a Bill/Bond ladder generator with customise (pick any (type, term) pair) and Smart-stagger modes. Per-rung yields are editable inline for "what-if" planning; unset values fall back to hard-coded reference yields per (security type, term-months) bucket.
- **Reports** — Standard export (CSV **and** PDF) with arbitrary filters, plus a **Tax Summary** mode that groups interest income into 1099-INT style totals separated by state-tax-exempt vs taxable.
- 🌗 Dark / light theme toggle persisted to `localStorage`.
- 💾 100% local data — stored under `bnb.*` keys; clear with browser dev tools if you ever want a clean slate.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Type-check and production build:

```bash
npm run typecheck
npm run build    # → dist/
```

## Deploy to GitHub Pages (free, public repo)

`vite.config.ts` is pre-set to `base: '/Bills-n-Bonds/'`, so the built bundle assumes the **repo is named `Bills-n-Bonds`**. Both paths below run on GitHub's free tier for public repos.

### Option A — automated deploys via GitHub Actions (recommended)

The repo ships with `.github/workflows/deploy.yml`, which runs `npm ci && npm run typecheck && npm run build` and publishes the `dist/` artifact on every push to `main`.

1. Create a **public** GitHub repo named `Bills-n-Bonds` and push this project to its `main` branch.
2. Visit **Settings → Pages** for that repo. Set **Source = GitHub Actions** (you only do this once — the workflow file handles the rest).
3. Push any commit to `main`. The action runs `setup-node` → `npm ci` → `npm run typecheck` → `npm run build` → `actions/deploy-pages@v4`.
4. Once the action goes green, the site is live at:

   `https://<your-gh-user>.github.io/Bills-n-Bonds/`

### Option B — manual deploy via `gh-pages` branch

If you'd rather skip Actions:

```bash
npm install -D gh-pages
npm run build
npx gh-pages -d dist
```

This pushes the contents of `dist/` to a `gh-pages` branch. In **Settings → Pages**, set **Source = Deploy from a branch**, branch `gh-pages`, root.

### Custom domain or different repo name

Update `base:` in `vite.config.ts` to match where the site will be served:

| Hosting target                        | Set `base` to              |
| ------------------------------------ | -------------------------- |
| User/org site (`username.github.io`) | `'/'`                      |
| Project site at `/<repo>/`           | `` `'/${repo}/'` ``        |
| Custom domain (CNAME)                | `'/'`                      |

After changing `base`, redeploy: `npm run build && npx gh-pages -d dist` (Option B), or push to `main` (Option A).

### Verify the deploy

- After ~60 seconds, `https://<your-gh-user>.github.io/Bills-n-Bonds/` returns HTTP 200 with the title "Bills n' Bonds — Treasury Portfolio Tracker".
- The DevTools Network tab should show no 404s for `/Bills-n-Bonds/assets/...` files.
- If you see a blank page or a 404, check that **Settings → Pages → Source** is set correctly and that `vite.config.ts`'s `base` matches the repo name's URL prefix.

### What's free on GitHub Pages

For public repos: 1 GB storage, 100 GB/month bandwidth soft cap, HTTPS included. No signup or payment info required.

## Architecture

```
src/
├── lib/
│   ├── types.ts          Domain types + palette tokens
│   ├── storage.tsx       React Context wrapping localStorage (holdings + settings)
│   ├── sample-data.ts    One-time demo seeder
│   ├── csv.ts            Parse + serialize holdings CSV
│   ├── pdf.ts            jsPDF + autoTable builders
│   ├── calc.ts           Date / interest math, cash flow, ladder planner
│   ├── format.ts         i18n formatters (USD, %, dates)
│   └── cn.ts             Tiny classnames util
├── components/
│   ├── layout/           AppShell (sidebar + topbar), ThemeProvider, ErrorBoundary
│   ├── ui/               KPICard, Card, Modal, TypeBadge, EmptyState, ToggleRow, Toast
│   ├── charts/           ChartTooltip (dark-aware)
│   └── holdings/         HoldingForm, HoldingsTable, ImportDialog
└── pages/                Dashboard, Holdings, Ladder, Reports
```

## Data sources

The app is **100% client-local**. Every page is computed directly from
your own holdings stored in `localStorage`; there are no live Treasury,
FRED, CPI, or news fetches anywhere in the source tree. Concretely:

- **Yields / rates / market data** — manual. Ladder-generator
  "what-if" yields are entered inline; unset values fall back to
  hard-coded reference yields keyed on (security type, term-months).
- **Tax summaries** — computed from your holding rows directly.
- **Maturity calendar / cash flow** — computed from your `maturityDate`
  columns.

If you ever want to reconnect live data, the path is straightforward:
deploy the included Cloudflare Worker (`workers/cors-proxy/`, currently
idle on the free tier) that fronts FRED + Treasury with CORS +
secret-injected API keys, then add the worker URL as a build-time env
var. Until you take that step, leave the repo as-is — it works fully
offline.

## License

MIT. Use it, fork it, brand it, ship it.
# Bills-n-Bonds
