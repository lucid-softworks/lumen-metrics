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

- `site/` — the dashboard (Vite + React + Tailwind, hand-rolled SVG charts)
- `results/` — one directory per night (`index.json` is the compact series the site loads;
  `<date>/test262.json` and `<date>/surfaces.json` hold the drill-down detail)
- `harness/` — suite runners and probes executed by the nightly workflow
- `scripts/` — tooling (`gen-mock-data.mjs` generates deterministic fake history for design work)

## Developing the site

```sh
cd site
npm install
node ../scripts/gen-mock-data.mjs   # only if results/ has no real data yet
npm run dev
```

The Pages build sets `BASE_PATH=/lumen-metrics/` (see `site/vite.config.js`);
`site/public/404.html` provides the SPA fallback so deep links work on Pages.
