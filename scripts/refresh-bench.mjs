// Re-runs ONLY the benchmark suite for every existing night in results/,
// checking out each night's recorded lumen commit and rewriting bench.json
// (per-tier scores, or null for commits with no bare `lumen` binary).
//
//   node scripts/refresh-bench.mjs [--lumen <repo>] [--dates <d1,d2,…>]
//
// --dates forces a re-run of just those nights, bypassing the already-tiered skip.
//
// Exists to repair nights benched before the stale-binary guard and tier
// support landed in run-night.mjs. Does not touch test262/surface results and
// does not commit — run the backfill (or commit manually) afterwards.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
const LUMEN = resolve(args.lumen || join(ROOT, '..', 'lumen'))
const WT = process.env.BACKFILL_WORKTREE || '/tmp/lumen-backfill-wt'
const TARGET = process.env.CARGO_TARGET_DIR || '/tmp/lumen-build'

const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: 'inherit', ...opts })

if (!existsSync(WT)) git(LUMEN, 'worktree', 'add', '--detach', WT, 'main')

const forced = args.dates ? args.dates.split(',') : null
const dates = forced ?? readdirSync(join(ROOT, 'results'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name)
  .sort()

for (const date of dates) {
  const benchPath = join(ROOT, 'results', date, 'bench.json')
  if (!forced && existsSync(benchPath) && readFileSync(benchPath, 'utf8').includes('"tiers"')) {
    console.log(`[${date}] already tiered — skipping`)
    continue
  }
  const t262Path = join(ROOT, 'results', date, 'test262.json')
  const t262 = existsSync(t262Path) ? JSON.parse(readFileSync(t262Path, 'utf8')) : null
  const sha7 = t262?.lumen_sha
  if (!sha7) {
    console.log(`[${date}] no recorded lumen sha — writing bench null`)
    writeFileSync(join(ROOT, 'results', date, 'bench.json'), 'null')
    continue
  }
  const sha = git(LUMEN, 'rev-parse', sha7)
  console.log(`\n[${date}] refreshing bench @ ${sha7}`)
  for (const f of ['Cargo.toml', 'Cargo.lock']) {
    if (existsSync(join(WT, f)) && git(WT, 'ls-files', f) === '') execFileSync('rm', [join(WT, f)])
  }
  git(WT, 'checkout', '-q', '--detach', sha)
  if (!existsSync(join(WT, 'Cargo.toml'))) {
    writeFileSync(join(WT, 'Cargo.toml'), readFileSync(join(ROOT, 'harness', 'synthetic-workspace.toml'), 'utf8'))
  }
  sh(process.execPath, [
    join(ROOT, 'harness', 'run-night.mjs'),
    '--lumen', WT, '--date', date, '--sha', sha7,
    '--v8', join(LUMEN, 'v8-v7'), '--out', join(ROOT, 'results'),
    '--only', 'bench',
  ], { env: { ...process.env, CARGO_TARGET_DIR: TARGET, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` } })
}

sh(process.execPath, [join(ROOT, 'harness', 'build-index.mjs')])
console.log('\nbench refresh complete')
