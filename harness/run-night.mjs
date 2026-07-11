// Runs every suite against one lumen checkout and writes one night of results:
//
//   node harness/run-night.mjs --lumen <checkout> --date YYYY-MM-DD --sha <sha> \
//        [--test262 <suite dir>] [--v8 <v8-v7 dir>] [--out <results dir>]
//
// Produces <out>/<date>/{test262.json,surfaces.json,bench.json}. Suites that a
// given commit cannot support yet (e.g. lumen-cli before it existed) are written
// as null so the site can show honest gaps. Used by both the backfill and the
// nightly CI job. Binaries build into CARGO_TARGET_DIR (defaults to
// <checkout>/target), so a shared cache dir makes multi-night runs cheap.

import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const HARNESS = dirname(fileURLToPath(import.meta.url))
const run = promisify(execFile)

const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
const LUMEN = resolve(args.lumen)
const DATE = args.date
const SHA = args.sha
const T262 = args.test262 ? resolve(args.test262) : join(LUMEN, 'test262')
const V8DIR = args.v8 ? resolve(args.v8) : join(LUMEN, 'v8-v7')
const OUT = join(resolve(args.out || join(HARNESS, '..', 'results')), DATE)
if (!LUMEN || !DATE || !SHA) {
  console.error('usage: run-night.mjs --lumen <dir> --date <date> --sha <sha>')
  process.exit(2)
}
const TARGET = process.env.CARGO_TARGET_DIR || join(LUMEN, 'target')
const CARGO = process.env.CARGO || join(process.env.HOME, '.cargo', 'bin', 'cargo')
const bin = (name) => join(TARGET, 'release', name)
const T262_TARGETS = ['annexB', 'built-ins', 'harness', 'intl402', 'language']
const FAILING_CAP = 3000

const log = (m) => console.log(`[${DATE}] ${m}`)

function cargoBuild(pkgs) {
  try {
    execFileSync(CARGO, ['build', '--release', '-q', ...pkgs.flatMap((p) => ['-p', p])], {
      cwd: LUMEN,
      env: { ...process.env, CARGO_TARGET_DIR: TARGET },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    return true
  } catch {
    return false
  }
}

async function runTest262() {
  log('building test262-runner…')
  rmSync(bin('test262-runner'), { force: true })
  if (!cargoBuild(['test262-runner']) || !existsSync(bin('test262-runner'))) {
    log('test262-runner failed to build — recording null')
    return null
  }
  rmSync(join(LUMEN, 'test262-report'), { recursive: true, force: true })
  log(`running test262 (${T262_TARGETS.join(', ')})…`)
  const t0 = Date.now()
  let stdout = ''
  try {
    const res = await run(bin('test262-runner'), T262_TARGETS, {
      cwd: LUMEN,
      env: { ...process.env, TEST262: T262, T262_SAMPLES: '1', T262_CAP: '1000000' },
      maxBuffer: 1024 * 1024 * 512,
      timeout: 1000 * 60 * 90,
    })
    stdout = res.stdout
  } catch (e) {
    // nonzero exit still leaves the report + stdout; salvage what we can
    stdout = e.stdout || ''
    if (!stdout) {
      log(`test262 run died: ${e.message}`)
      return null
    }
  }
  log(`test262 finished in ${((Date.now() - t0) / 60000).toFixed(1)} min`)

  const summaryPath = join(LUMEN, 'test262-report', 'summary.json')
  if (!existsSync(summaryPath)) {
    log('no summary.json — recording null')
    return null
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))

  // failing paths appear after "sample failures:" as "  <rel>\n      <why>"
  const failing = []
  const tail = stdout.split('sample failures:')[1] || ''
  for (const line of tail.split('\n')) {
    const m = /^ {2}(\S+\.js)$/.exec(line)
    if (m) failing.push(m[1])
  }
  failing.sort()
  const total = summary.total
  return {
    date: DATE,
    lumen_sha: SHA,
    test262_sha: gitShort(T262),
    targets: summary.targets,
    total,
    pass_rate: summary.pass_rate,
    categories: summary.categories,
    failing: failing.slice(0, FAILING_CAP),
    failing_truncated: total.fail > Math.min(failing.length, FAILING_CAP),
  }
}

function gitShort(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

async function probe(script) {
  const file = join(OUT, `.probe-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, script)
  try {
    const { stdout } = await run(bin('lumen-cli'), [file], { timeout: 120000, maxBuffer: 1024 * 1024 * 64 })
    const line = stdout.split('\n').find((l) => l.startsWith('@@RESULT@@'))
    return line ? JSON.parse(line.slice('@@RESULT@@'.length)) : null
  } catch (e) {
    log(`probe failed: ${e.message.split('\n')[0]}`)
    return null
  } finally {
    rmSync(file, { force: true })
  }
}

async function runSurfaces() {
  if (!existsSync(join(LUMEN, 'crates', 'lumen-cli'))) {
    log('no lumen-cli crate at this commit — surfaces null')
    return null
  }
  log('building lumen-cli…')
  rmSync(bin('lumen-cli'), { force: true })
  if (!cargoBuild(['lumen-cli']) || !existsSync(bin('lumen-cli'))) {
    log('lumen-cli failed to build — surfaces null')
    return null
  }

  const wintertc = JSON.parse(readFileSync(join(HARNESS, 'wintertc.json'), 'utf8'))
  const node = JSON.parse(readFileSync(join(HARNESS, 'baselines', 'node.json'), 'utf8'))
  const bun = JSON.parse(readFileSync(join(HARNESS, 'baselines', 'bun.json'), 'utf8'))

  log('probing WinterTC globals…')
  const wtc = await probe(`
    const MIN = ${JSON.stringify(wintertc.minimum)};
    const EXTRA = ${JSON.stringify(wintertc.beyond_minimum)};
    const has = (n) => typeof globalThis[n] !== 'undefined';
    console.log('@@RESULT@@' + JSON.stringify({
      supported: MIN.filter(has),
      missing: MIN.filter((n) => !has(n)),
      beyond_minimum: EXTRA.filter(has),
    }));
  `)

  const moduleProbe = (baseline, prefixless) => `
    const BASELINE = ${JSON.stringify(baseline.modules)};
    const out = [];
    for (const [name, names] of Object.entries(BASELINE)) {
      let ns = null;
      try { ns = await import(${prefixless ? "'node:' + name" : 'name'}); } catch {}
      const missing = names.filter((n) => !(ns && n in ns));
      out.push({ name, total: names.length, have: names.length - missing.length, present: !!ns, missing });
    }
    console.log('@@RESULT@@' + JSON.stringify(out));
  `
  log('probing Node module surface…')
  const nodeModules = await probe(moduleProbe(node, true))
  log('probing Bun surface…')
  const bunModules = await probe(moduleProbe(bun, false))

  return {
    date: DATE,
    lumen_sha: SHA,
    node_version: node.version,
    bun_version: bun.version,
    wintertc: wtc ? { ...wtc, total: wintertc.minimum.length } : null,
    node: nodeModules ? { modules: nodeModules } : null,
    bun: bunModules ? { surfaces: bunModules } : null,
  }
}

const BENCH_LABELS = {
  Richards: 'Richards', DeltaBlue: 'DeltaBlue', Crypto: 'Crypto', RayTrace: 'RayTrace',
  EarleyBoyer: 'EarleyBoyer', RegExp: 'RegExp', Splay: 'Splay', NavierStokes: 'NavierStokes',
}

const V8_RAW = 'https://raw.githubusercontent.com/mozilla/arewefastyet/master/benchmarks/v8-v7'
const V8_FILES = ['base.js', 'richards.js', 'deltablue.js', 'crypto.js', 'raytrace.js', 'earley-boyer.js', 'regexp.js', 'splay.js', 'navier-stokes.js', 'run.js']

async function ensureV8() {
  if (existsSync(join(V8DIR, 'base.js'))) return true
  log('v8-v7 suite missing — downloading…')
  try {
    mkdirSync(V8DIR, { recursive: true })
    for (const f of V8_FILES) {
      const res = await fetch(`${V8_RAW}/${f}`)
      if (!res.ok) throw new Error(`${res.status} ${f}`)
      writeFileSync(join(V8DIR, f), await res.text())
    }
    return true
  } catch (e) {
    log(`v8-v7 download failed: ${e.message}`)
    return false
  }
}

function parseBenchOutput(stdout) {
  const benches = {}
  for (const line of stdout.split('\n')) {
    const m = /^([A-Za-z]+): (\d+)/.exec(line.trim())
    if (m && BENCH_LABELS[m[1]]) benches[m[1]] = Number(m[2])
    const s = /^Score \(version 7\): (\d+)/.exec(line.trim())
    if (s) benches.__composite = Number(s[1])
  }
  const composite = benches.__composite ?? null
  delete benches.__composite
  return Object.keys(benches).length ? { composite, benches } : null
}

async function benchProcess(label, cmd, cmdArgs, env) {
  let stdout = ''
  try {
    const res = await run(cmd, cmdArgs, {
      timeout: 1000 * 60 * 15,
      maxBuffer: 1024 * 1024 * 16,
      env: env ? { ...process.env, ...env } : process.env,
    })
    stdout = res.stdout
  } catch (e) {
    stdout = e.stdout || ''
    log(`bench run (${label}) ended early: ${e.message.split('\n')[0]}`)
  }
  return parseBenchOutput(stdout)
}

// Reference runtimes, re-measured every night so the comparison is always
// same-machine, same-night. Each runs the suite full and JIT-disabled — the
// jitless mode is the like-for-like comparison while lumen's own JIT matures.
// They take one script, so the suite gets concatenated (with a d8-style
// print() shim the upstream driver expects).
const REF_RUNTIMES = [
  {
    key: 'node',
    candidates: [process.env.NODE_BIN, 'node'],
    modes: [
      { key: 'node', args: (f) => [f] },
      { key: 'node-jitless', args: (f) => ['--jitless', f] },
    ],
  },
  {
    key: 'bun',
    candidates: [process.env.BUN_BIN, 'bun', `${process.env.HOME}/.bun/bin/bun`],
    modes: [
      { key: 'bun', args: (f) => [f] },
      { key: 'bun-jitless', args: (f) => [f], env: { BUN_JSC_useJIT: 'false' } },
    ],
  },
  {
    key: 'deno',
    candidates: [process.env.DENO_BIN, 'deno', '/opt/homebrew/bin/deno', `${process.env.HOME}/.deno/bin/deno`],
    // --allow-read: deno's CommonJS compat layer needs it to load the .cjs suite
    modes: [
      { key: 'deno', args: (f) => ['run', '--allow-read', f] },
      { key: 'deno-jitless', args: (f) => ['run', '--allow-read', '--v8-flags=--jitless', f] },
    ],
  },
  {
    key: 'quickjs',
    candidates: [process.env.QJS_BIN, 'qjs', '/opt/homebrew/bin/qjs'],
    versionArgs: ['-h'], // no --version flag; -h leads with "QuickJS version <date>"
    // a pure interpreter — no JIT to disable, so one mode only
    modes: [{ key: 'quickjs', args: (f) => [f] }],
  },
]

function resolveRuntime(candidates, versionArgs = ['--version']) {
  for (const c of candidates.filter(Boolean)) {
    let out
    try {
      out = execFileSync(c, versionArgs, { encoding: 'utf8', timeout: 10000 })
    } catch (e) {
      // some CLIs print version/help but exit non-zero (qjs -h); a missing
      // binary (ENOENT) has no output and falls through to the next candidate
      out = [e.stdout, e.stderr].filter((s) => typeof s === 'string').join('\n').trim() || undefined
    }
    if (!out) continue
    // first token containing a digit: "v22.16.0", "deno 2.9.1 (…)", "QuickJS version 2026-06-04"
    const tok = out.trim().split('\n')[0].split(' ').find((t) => /\d/.test(t))
    if (tok) return { cmd: c, version: tok.replace(/^v/, '') }
  }
  return null
}

async function benchReferences(files, driverFile) {
  const shim = 'if (typeof print === "undefined") { globalThis.print = function () { console.log(Array.prototype.join.call(arguments, " ")); }; }\n'
  // .cjs so every runtime executes it as sloppy-mode CommonJS — deno runs plain
  // .js as a strict ES module, which the 2008-era suite code can't survive
  const suite = shim + [...files, driverFile].map((f) => readFileSync(f, 'utf8')).join('\n;\n')
  const suiteFile = join(OUT, '.ref-suite.cjs')
  writeFileSync(suiteFile, suite)
  const out = {}
  try {
    for (const rt of REF_RUNTIMES) {
      const resolved = resolveRuntime(rt.candidates, rt.versionArgs)
      if (!resolved) {
        log(`reference runtime ${rt.key} not found — skipping`)
        continue
      }
      for (const mode of rt.modes) {
        log(`running v8-v7 bench (${mode.key} ${resolved.version})…`)
        const r = await benchProcess(mode.key, resolved.cmd, mode.args(suiteFile), mode.env)
        if (r) out[mode.key] = { version: resolved.version, ...r }
      }
    }
  } finally {
    rmSync(suiteFile, { force: true })
  }
  return Object.keys(out).length ? out : null
}

// --- yt-dlp/ejs: real-world workload (parse YouTube's ~3 MB player with a
// JS-in-JS parser, solve sig/nsig challenges, print results as JSON). Timed
// wall-clock, lower is better; output is verified against node's answer so a
// fast-but-wrong run can't score. Bundle is the lucid-softworks/lumen#12
// reproducer, cached locally.
const EJS_URL = 'https://github.com/user-attachments/files/29786020/code.js'
const EJS_CACHE = join(HARNESS, '..', '.cache', 'ejs-code.js')

async function ensureEjs() {
  if (existsSync(EJS_CACHE)) return EJS_CACHE
  log('ejs bundle missing — downloading…')
  try {
    mkdirSync(dirname(EJS_CACHE), { recursive: true })
    const res = await fetch(EJS_URL)
    if (!res.ok) throw new Error(String(res.status))
    writeFileSync(EJS_CACHE, await res.text())
    return EJS_CACHE
  } catch (e) {
    log(`ejs download failed: ${e.message}`)
    return null
  }
}

async function timeOnce(cmd, cmdArgs, env) {
  const t0 = performance.now()
  try {
    const res = await run(cmd, cmdArgs, {
      timeout: 1000 * 60 * 15,
      maxBuffer: 1024 * 1024 * 16,
      env: env ? { ...process.env, ...env } : process.env,
    })
    return { ms: Math.round(performance.now() - t0), out: res.stdout.trim() }
  } catch {
    return null
  }
}

// median of 3 for fast configs; a single measurement is enough past 20 s
async function timeEjs(label, cmd, cmdArgs, env) {
  log(`timing ejs (${label})…`)
  const first = await timeOnce(cmd, cmdArgs, env)
  if (!first) {
    log(`ejs (${label}) failed or timed out`)
    return null
  }
  if (first.ms >= 20000) return { ms: first.ms, runs: 1, out: first.out }
  const more = [await timeOnce(cmd, cmdArgs, env), await timeOnce(cmd, cmdArgs, env)].filter(Boolean)
  const all = [first.ms, ...more.map((r) => r.ms)].sort((a, b) => a - b)
  return { ms: all[Math.floor((all.length - 1) / 2)], runs: all.length, out: first.out }
}

async function runEjs(tiers) {
  const file = await ensureEjs()
  if (!file) return null
  const out = { bytes: readFileSync(file).length, tiers: {}, references: {} }
  let expected = null

  for (const rt of REF_RUNTIMES) {
    const resolved = resolveRuntime(rt.candidates, rt.versionArgs)
    if (!resolved) continue
    for (const mode of rt.modes) {
      const r = await timeEjs(mode.key, resolved.cmd, mode.args(file), mode.env)
      if (!r) continue
      if (mode.key === 'node') expected = r.out
      out.references[mode.key] = { version: resolved.version, ms: r.ms, runs: r.runs, out: r.out }
    }
  }
  for (const tier of tiers) {
    const r = await timeEjs(`lumen ${tier}`, bin('lumen'), tier === 'default' ? [file] : [`--tier=${tier}`, file])
    if (r) out.tiers[tier] = { ms: r.ms, runs: r.runs, out: r.out }
  }

  // verify every run produced node's answer (or the first answer seen)
  expected = expected ?? Object.values(out.references)[0]?.out ?? Object.values(out.tiers)[0]?.out
  for (const group of [out.tiers, out.references]) {
    for (const r of Object.values(group)) {
      r.verified = r.out === expected
      delete r.out
    }
  }
  if (!Object.keys(out.tiers).length && !Object.keys(out.references).length) return null
  return out
}

async function runBench() {
  // the bare `lumen` bin didn't exist for the earliest commits; without this
  // guard a lib-only `cargo build -p lumen` "succeeds" and the shared target
  // dir serves another night's binary — silently benchmarking the wrong engine
  const binSrc = join(LUMEN, 'crates', 'lumen', 'src', 'bin', 'lumen.rs')
  if (!existsSync(binSrc)) {
    log('no bare `lumen` bin at this commit — bench null')
    return null
  }
  if (!(await ensureV8())) {
    log('no v8-v7 suite — bench null')
    return null
  }
  log('building lumen (bare engine)…')
  rmSync(bin('lumen'), { force: true })
  if (!cargoBuild(['lumen']) || !existsSync(bin('lumen'))) {
    log('lumen bin failed to build — bench null')
    return null
  }

  // detect which tiers this commit's CLI understands (jit landed later than
  // interp/bytecode); each supported tier gets its own suite run
  const binSource = readFileSync(binSrc, 'utf8')
  const tiers = binSource.includes('--tier=')
    ? ['interp', 'bytecode', ...(binSource.includes('"jit"') ? ['jit'] : [])]
    : ['default']

  // upstream run.js uses shell load(); the CLI takes files in sequence instead
  const driver = readFileSync(join(V8DIR, 'run.js'), 'utf8').split('\n').filter((l) => !l.startsWith('load(')).join('\n')
  const driverFile = join(OUT, '.driver.js')
  writeFileSync(driverFile, driver)
  const files = ['base.js', 'richards.js', 'deltablue.js', 'crypto.js', 'raytrace.js', 'earley-boyer.js', 'regexp.js', 'splay.js', 'navier-stokes.js']
    .map((f) => join(V8DIR, f))

  const out = {}
  let references = null
  try {
    for (const tier of tiers) {
      log(`running v8-v7 bench (${tier})…`)
      const r = await benchProcess(tier, bin('lumen'), tier === 'default' ? [...files, driverFile] : [`--tier=${tier}`, ...files, driverFile])
      if (r) out[tier] = r
    }
    references = await benchReferences(files, driverFile)
  } finally {
    rmSync(driverFile, { force: true })
  }
  if (Object.keys(out).length === 0) {
    log('bench produced no scores — null')
    return null
  }
  const ejs = await runEjs(tiers)
  return { date: DATE, lumen_sha: SHA, tiers: out, references, ejs }
}

const ONLY = args.only || null
mkdirSync(OUT, { recursive: true })

if (!ONLY || ONLY === 'test262') {
  const t262 = await runTest262()
  writeFileSync(join(OUT, 'test262.json'), JSON.stringify(t262))
  if (t262) log(`  test262: ${t262.total.pass}/${t262.total.pass + t262.total.fail} (${t262.pass_rate}%)`)
}
if (!ONLY || ONLY === 'surfaces') {
  const surfaces = await runSurfaces()
  writeFileSync(join(OUT, 'surfaces.json'), JSON.stringify(surfaces))
  if (surfaces?.wintertc) log(`  wintertc: ${surfaces.wintertc.supported.length}/${surfaces.wintertc.total}`)
}
if (!ONLY || ONLY === 'bench') {
  const bench = await runBench()
  writeFileSync(join(OUT, 'bench.json'), JSON.stringify(bench))
  if (bench) log(`  bench: ${Object.entries(bench.tiers).map(([t, r]) => `${t}=${r.composite}`).join(' ')}`)
}
log(`wrote ${OUT}`)
