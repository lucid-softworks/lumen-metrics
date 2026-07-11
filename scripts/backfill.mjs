// Backfills nightly results for lumen's history: for each night, picks the last
// commit on main before 03:00 UTC, checks it out in a scratch worktree, runs the
// full harness, and commits the results backdated to that night.
//
//   node scripts/backfill.mjs [--lumen <repo>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//
// Re-runnable: nights whose results already exist are skipped (and committed if
// they aren't yet). Nights whose cutoff resolves to the same lumen commit as the
// previous night reuse its results instead of re-running identical code.
//
// Early lumen history was filter-extracted from a monorepo and lacks the root
// workspace Cargo.toml; a minimal one is synthesized so those commits build.

import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
const LUMEN = resolve(args.lumen || join(ROOT, '..', 'lumen'))
const WT = process.env.BACKFILL_WORKTREE || '/tmp/lumen-backfill-wt'
const TARGET = process.env.CARGO_TARGET_DIR || '/tmp/lumen-build'
const CUTOFF = 'T03:00:00Z' // matches lumen's own nightly schedule
const DAY = 86400000

const SYNTHETIC_WORKSPACE = `# synthesized by lumen-metrics backfill: this commit predates the extraction
# of lumen from its parent monorepo, so the workspace root is missing here.
[workspace]
resolver = "2"
members = ["crates/*"]

[workspace.package]
version = "0.0.0"
edition = "2021"
license = "MIT"

[workspace.lints.clippy]
type_complexity = "allow"
too_many_arguments = "allow"
doc_lazy_continuation = "allow"
needless_range_loop = "allow"

[profile.release]
opt-level = 3
lto = "thin"
`

const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: 'inherit', ...opts })

const firstCommitDate = git(LUMEN, 'log', '--reverse', '--format=%cs', 'main').split('\n')[0]
const from = args.from || new Date(new Date(firstCommitDate + 'T00:00:00Z').getTime() + DAY).toISOString().slice(0, 10)
const to = args.to || new Date(Date.now()).toISOString().slice(0, 10)

console.log(`backfill: ${from} → ${to} (lumen ${LUMEN})`)

if (!existsSync(WT)) {
  git(LUMEN, 'worktree', 'add', '--detach', WT, 'main')
}

function hasResults(date) {
  const f = join(ROOT, 'results', date, 'test262.json')
  // treat a night whose test262 run produced literal null as absent (a failed run)
  return existsSync(f) && readFileSync(f, 'utf8').trim() !== 'null'
}

function isCommitted(date) {
  return git(ROOT, 'log', '-1', '--format=%h', '--', `results/${date}`) !== ''
}

function commitNight(date, sha7) {
  sh(process.execPath, [join(ROOT, 'harness', 'build-index.mjs')])
  const when = `${date}T05:30:00Z`
  sh('git', ['-C', ROOT, 'add', `results/${date}`, 'results/index.json'])
  sh('git', ['-C', ROOT, 'commit', '-q', '-m', `chore(results): nightly ${date} (lumen ${sha7})`], {
    env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
  })
  console.log(`[${date}] committed`)
}

function copyNight(fromDate, toDate) {
  const src = join(ROOT, 'results', fromDate)
  const dst = join(ROOT, 'results', toDate)
  mkdirSync(dst, { recursive: true })
  for (const f of readdirSync(src)) {
    const data = readFileSync(join(src, f), 'utf8')
    writeFileSync(join(dst, f), data.replaceAll(`"date":"${fromDate}"`, `"date":"${toDate}"`))
  }
}

let prev = null // { date, sha }
for (let t = new Date(from + 'T00:00:00Z').getTime(); t <= new Date(to + 'T00:00:00Z').getTime(); t += DAY) {
  const date = new Date(t).toISOString().slice(0, 10)
  let sha
  try {
    sha = git(LUMEN, 'rev-list', '-1', `--before=${date}${CUTOFF}`, 'main')
  } catch {
    sha = ''
  }
  if (!sha) {
    console.log(`[${date}] no commit before cutoff — skipping`)
    continue
  }
  const sha7 = sha.slice(0, 7)

  if (hasResults(date)) {
    if (!isCommitted(date)) {
      console.log(`[${date}] results exist but uncommitted — committing`)
      commitNight(date, sha7)
    } else {
      console.log(`[${date}] already done — skipping`)
    }
    prev = { date, sha }
    continue
  }
  rmSync(join(ROOT, 'results', date), { recursive: true, force: true })

  if (prev && prev.sha === sha && hasResults(prev.date)) {
    console.log(`[${date}] same lumen commit as ${prev.date} (${sha7}) — reusing its results`)
    copyNight(prev.date, date)
    commitNight(date, sha7)
    prev = { date, sha }
    continue
  }

  console.log(`\n[${date}] lumen @ ${sha7}`)
  // the synthetic workspace file (and its lockfile) are untracked; drop them so
  // checkout of a commit that *does* track them can't collide
  for (const f of ['Cargo.toml', 'Cargo.lock']) {
    if (existsSync(join(WT, f)) && git(WT, 'ls-files', f) === '') rmSync(join(WT, f))
  }
  git(WT, 'checkout', '-q', '--detach', sha)
  if (!existsSync(join(WT, 'Cargo.toml'))) {
    console.log(`[${date}] no workspace root at this commit — synthesizing one`)
    writeFileSync(join(WT, 'Cargo.toml'), SYNTHETIC_WORKSPACE)
  }

  try {
    sh(process.execPath, [
      join(ROOT, 'harness', 'run-night.mjs'),
      '--lumen', WT,
      '--date', date,
      '--sha', sha7,
      '--test262', join(LUMEN, 'test262'),
      '--v8', join(LUMEN, 'v8-v7'),
      '--out', join(ROOT, 'results'),
    ], { env: { ...process.env, CARGO_TARGET_DIR: TARGET, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` } })
  } catch (e) {
    console.error(`[${date}] run-night failed: ${e.message} — leaving night absent`)
    rmSync(join(ROOT, 'results', date), { recursive: true, force: true })
    continue
  }
  if (!hasResults(date)) {
    console.log(`[${date}] produced no usable test262 result — leaving night absent`)
    rmSync(join(ROOT, 'results', date), { recursive: true, force: true })
    continue
  }
  commitNight(date, sha7)
  prev = { date, sha }
}

console.log('\nbackfill complete — review `git log --format="%ad %s" --date=short` and push when happy')
