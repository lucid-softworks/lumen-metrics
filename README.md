# lumen-metrics

Nightly conformance and performance tracking for [lumen](https://github.com/lucid-softworks/lumen),
in the spirit of [test262.fyi](https://test262.fyi).

Every night, CI builds lumen at the latest commit, runs the suites below, commits the
results to `results/`, and deploys the dashboard to GitHub Pages.

| Suite | What it measures |
|---|---|
| test262 | Full ECMAScript conformance suite, per-category, with failing-test diffs night-over-night |
| WinterTC | Minimum Common API globals present |
| Node surface | `node:` module exported names present vs real Node — a name inventory, not behavioral compat |
| Bun surface | `bun:` module names present vs real Bun — same caveat |
| V8 bench | v8-v7 suite (Richards, DeltaBlue, …) composite + per-benchmark scores |

## Layout

- `site/` — the dashboard (Vite + React + Tailwind, hand-rolled SVG charts).
  `site/public/results` is a symlink to `results/`, so dev and Pages builds serve real data.
- `results/` — one directory per night (`index.json` is the compact series the site loads;
  `<date>/{test262,surfaces,bench}.json` hold the drill-down detail). A suite that a night's
  commit could not support (e.g. before `lumen-cli` existed) is recorded as `null`.
- `harness/` — the suite runners:
  - `run-night.mjs` — runs everything against one lumen checkout, writes one night
  - `build-index.mjs` — rebuilds `results/index.json` from the per-night files
  - `gen-baselines.mjs` — regenerates the Node/Bun API-surface yardsticks (committed
    under `harness/baselines/`; regenerate deliberately when bumping reference versions)
  - `wintertc.json` — the WinterTC Minimum Common API list, mirrored from lumen's own test
- `scripts/backfill.mjs` — reconstructs history: per night, checks out the last lumen commit
  before 03:00 UTC, runs the harness, and commits the results backdated to that night
- `.github/workflows/nightly.yml` — the 05:00 UTC nightly: run suites → commit results →
  deploy Pages (one-time setup: Settings → Pages → Source: “GitHub Actions”)

test262 is pinned by SHA (workflow env `TEST262_SHA`) so chart movement is always lumen's,
never upstream suite churn. API-surface numbers are name inventories, not behavioral results.

## Developing the site

```sh
cd site
npm install
npm run dev
```

`scripts/gen-mock-data.mjs` writes deterministic fake history to /tmp for chart design work.
The Pages build sets `BASE_PATH=/lumen-metrics/` (see `site/vite.config.js`);
`site/public/404.html` provides the SPA fallback so deep links work on Pages.
