// Generates MOCK nightly results for chart design work, in the same schema the
// real harness (harness/run-night.mjs) writes into results/. Writes to /tmp by
// default so it can never clobber real data; point the site at it with a
// symlink or MOCK_OUT if you need it.
//
// Deterministic (seeded PRNG) so re-runs produce identical output.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.MOCK_OUT || '/tmp/lumen-metrics-mock-results'

let seed = 0x10e5
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const jitter = (amt) => (rand() * 2 - 1) * amt

const START = new Date('2026-03-01T00:00:00Z')
const END = new Date('2026-07-10T00:00:00Z')
const DAY = 86400000
const dates = []
for (let t = START.getTime(); t <= END.getTime(); t += DAY) {
  dates.push(new Date(t).toISOString().slice(0, 10))
}
const N = dates.length

// logistic ramp: fraction complete on day i, hitting ~99% at `done` (day index)
function ramp(i, start, done, floor = 0) {
  const mid = (start + done) / 2
  const k = 10 / Math.max(done - start, 1)
  const v = 1 / (1 + Math.exp(-k * (i - mid)))
  return floor + (1 - floor) * v
}

// --- test262 categories (counts roughly proportional to the real suite) ---
const CATEGORIES = [
  ['language/expressions', 11102, 0, 55, 0.82],
  ['language/statements', 9337, 0, 58, 0.8],
  ['built-ins/Temporal', 7100, 20, 118, 0.1],
  ['built-ins/Intl', 4900, 15, 105, 0.2],
  ['built-ins/TypedArray', 4100, 5, 80, 0.5],
  ['built-ins/Object', 3400, 0, 50, 0.75],
  ['built-ins/Array', 3050, 0, 48, 0.7],
  ['built-ins/RegExp', 1900, 5, 90, 0.55],
  ['built-ins/String', 1180, 0, 45, 0.7],
  ['built-ins/Promise', 620, 0, 62, 0.6],
  ['built-ins/Proxy+Reflect', 630, 8, 74, 0.4],
  ['built-ins/other', 4230, 0, 88, 0.6],
  ['annexB', 850, 25, 112, 0.3],
  ['harness', 150, 0, 20, 0.9],
]
const T262_TOTAL = CATEGORIES.reduce((s, c) => s + c[1], 0)

// pool of realistic failing-test paths per category
const FAIL_POOL = {}
for (const [name, total] of CATEGORIES) {
  const pool = []
  const leaves = [
    'order-of-evaluation.js', 'prop-desc.js', 'length.js', 'name.js',
    'not-a-constructor.js', 'proto-from-ctor-realm.js', 'tostring-conversion.js',
    'coerced-values.js', 'negative-zero.js', 'proxy-trap-order.js',
    'species-constructor.js', 'detached-buffer.js', 'timezone-offset.js',
    'rounding-mode-halfExpand.js', 'grapheme-segmentation.js', 'lastIndex-restore.js',
  ]
  for (let i = 0; i < Math.min(total, 400); i++) {
    pool.push(`test/${name.replace('+Reflect', '').replace('/other', '')}/${leaves[i % leaves.length].replace('.js', '')}-${i}.js`)
  }
  FAIL_POOL[name] = pool
}

// regression event: bytecode-tier bug lands June 20, fixed June 23
const REG_START = dates.indexOf('2026-06-20')
const REG_END = dates.indexOf('2026-06-23')

function test262ForDay(i) {
  const categories = {}
  let pass = 0, fail = 0, skip = 0
  const failing = []
  for (const [name, total, skipN, doneDay, floor] of CATEGORIES) {
    let frac = Math.min(ramp(i, 5, doneDay, floor) + jitter(0.002), 1)
    if (i >= REG_START && i < REG_END && name.startsWith('language')) frac -= 0.004
    const p = Math.round((total - skipN) * frac)
    const f = total - skipN - p
    categories[name] = { pass: p, fail: f, skip: skipN, total }
    pass += p; fail += f; skip += skipN
    const pool = FAIL_POOL[name]
    for (let k = 0; k < Math.min(f, 40); k++) failing.push(pool[(k * 7 + (f % 13)) % pool.length])
  }
  return { pass, fail, skip, categories, failing: failing.sort() }
}

// --- WinterTC Minimum Common API (56 globals) ---
const WINTERTC = [
  'AbortController', 'AbortSignal', 'Blob', 'ByteLengthQueuingStrategy', 'CompressionStream',
  'CountQueuingStrategy', 'Crypto', 'CryptoKey', 'CustomEvent', 'DecompressionStream',
  'DOMException', 'Event', 'EventTarget', 'File', 'FormData', 'Headers', 'ReadableByteStreamController',
  'ReadableStream', 'ReadableStreamBYOBReader', 'ReadableStreamBYOBRequest', 'ReadableStreamDefaultController',
  'ReadableStreamDefaultReader', 'Request', 'Response', 'SubtleCrypto', 'TextDecoder', 'TextDecoderStream',
  'TextEncoder', 'TextEncoderStream', 'TransformStream', 'TransformStreamDefaultController', 'URL',
  'URLPattern', 'URLSearchParams', 'WebAssembly', 'WritableStream', 'WritableStreamDefaultController',
  'WritableStreamDefaultWriter', 'atob', 'btoa', 'console', 'crypto', 'fetch', 'navigator',
  'performance', 'queueMicrotask', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'structuredClone', 'globalThis', 'reportError', 'self', 'setImmediate', 'clearImmediate',
]

// --- Node module surface (name, export count, day it starts filling, day ~done) ---
const NODE_MODULES = [
  ['assert', 22, 0, 40], ['assert/strict', 22, 0, 40], ['async_hooks', 7, 60, 110],
  ['buffer', 14, 0, 25], ['child_process', 9, 50, 100], ['cluster', 16, 80, 140],
  ['console', 31, 0, 30], ['constants', 230, 30, 95], ['crypto', 73, 20, 90],
  ['dgram', 3, 70, 125], ['diagnostics_channel', 6, 75, 130], ['dns', 50, 55, 115],
  ['dns/promises', 46, 55, 115], ['domain', 8, 90, 150], ['events', 20, 0, 20],
  ['fs', 108, 10, 70], ['fs/promises', 34, 10, 70], ['http', 40, 35, 100],
  ['http2', 38, 85, 145], ['https', 12, 40, 105], ['inspector', 14, 95, 160],
  ['module', 34, 25, 85], ['net', 22, 45, 105], ['os', 30, 5, 45],
  ['path', 20, 0, 15], ['perf_hooks', 15, 60, 120], ['process', 82, 5, 60],
  ['punycode', 8, 70, 120], ['querystring', 8, 15, 55], ['readline', 12, 50, 110],
  ['repl', 10, 90, 155], ['stream', 25, 10, 65], ['stream/promises', 4, 10, 65],
  ['stream/web', 20, 10, 60], ['string_decoder', 2, 20, 50], ['sys', 33, 80, 135],
  ['timers', 12, 0, 25], ['timers/promises', 6, 0, 30], ['tls', 25, 75, 140],
  ['trace_events', 4, 100, 160], ['tty', 6, 55, 105], ['url', 18, 0, 25],
  ['util', 33, 5, 55], ['util/types', 43, 30, 90], ['v8', 20, 85, 145],
  ['vm', 16, 65, 125], ['wasi', 3, 95, 155], ['worker_threads', 22, 60, 120],
  ['zlib', 154, 40, 110], ['inspector/promises', 6, 100, 165], ['net/blocklist', 4, 90, 150],
  ['sea', 3, 110, 170], ['test', 18, 70, 130], ['test/reporters', 6, 75, 135],
  ['trace', 4, 105, 165], ['sqlite', 12, 95, 150], ['quic', 8, 120, 180], ['webcrypto', 10, 30, 80],
]
const NODE_NAMES_TOTAL = NODE_MODULES.reduce((s, m) => s + m[1], 0)

// --- Bun surface ---
const BUN_SURFACES = [
  ['bun', 105, 20, 130], ['bun:ffi', 15, 60, 120], ['bun:jsc', 37, 90, 170],
  ['bun:sqlite', 6, 80, 140], ['bun:test', 20, 50, 115],
]
const BUN_NAMES_TOTAL = BUN_SURFACES.reduce((s, m) => s + m[1], 0)

function surfacesForDay(i) {
  const wtcCount = Math.min(56, Math.round(56 * ramp(i, 0, 70, 0.73)))
  const nodeModules = NODE_MODULES.map(([name, total, start, done]) => {
    const have = Math.min(total, Math.round(total * ramp(i, start, done, 0)))
    return { name, total, have, present: have > 0 }
  })
  const bun = BUN_SURFACES.map(([name, total, start, done]) => {
    const have = Math.min(total, Math.round(total * ramp(i, start, done, 0)))
    return { name, total, have, present: have > 0 }
  })
  return {
    wintertc: { supported: WINTERTC.slice(0, wtcCount), missing: WINTERTC.slice(wtcCount) },
    node: { modules: nodeModules },
    bun: { surfaces: bun },
  }
}

// --- benchmarks (v8-v7 suite; collection starts April 1) ---
const BENCH_START = dates.indexOf('2026-04-01')
const BENCHES = [
  ['Richards', 30, 210], ['DeltaBlue', 25, 240], ['Crypto', 40, 190],
  ['RayTrace', 35, 260], ['EarleyBoyer', 28, 175], ['RegExp', 15, 120],
  ['Splay', 45, 205], ['NavierStokes', 50, 300],
]
function benchForDay(i) {
  if (i < BENCH_START) return null
  const p = (i - BENCH_START) / (N - BENCH_START)
  const benches = {}
  const noiseScale = 0.06 // CI runners are noisy
  for (const [name, lo, hi] of BENCHES) {
    const base = lo + (hi - lo) * Math.pow(p, 0.75)
    // a step-improvement for Splay mid-May (GC tuning), RegExp late June
    let boost = 1
    if (name === 'Splay' && dates[i] >= '2026-05-14') boost = 1.35
    if (name === 'RegExp' && dates[i] >= '2026-06-25') boost = 1.6
    benches[name] = Math.round(base * boost * (1 + jitter(noiseScale)))
  }
  const vals = Object.values(benches)
  const composite = Math.round(Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length))
  return { composite, benches }
}

// --- write everything ---
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const shaFor = (i) => ((i * 2654435761) >>> 8).toString(16).padStart(7, '0').slice(0, 7)
const index = { generated: dates[N - 1], suite_totals: { test262: T262_TOTAL }, nights: [] }

dates.forEach((date, i) => {
  const t = test262ForDay(i)
  const s = surfacesForDay(i)
  const bench = benchForDay(i)
  const nodeHave = s.node.modules.reduce((sum, m) => sum + m.have, 0)
  const nodePresent = s.node.modules.filter((m) => m.have === m.total).length
  const bunHave = s.bun.surfaces.reduce((sum, m) => sum + m.have, 0)

  index.nights.push({
    date,
    lumen_sha: shaFor(i),
    test262: { pass: t.pass, fail: t.fail, skip: t.skip, total: T262_TOTAL },
    wintertc: { pass: s.wintertc.supported.length, total: 56 },
    node: {
      names: nodeHave, names_total: NODE_NAMES_TOTAL,
      modules_complete: nodePresent, modules_total: NODE_MODULES.length,
    },
    bun: { names: bunHave, names_total: BUN_NAMES_TOTAL },
    bench,
  })

  const dir = join(OUT, date)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'test262.json'), JSON.stringify({
    date, lumen_sha: shaFor(i), test262_sha: 'f2c9a71',
    total: { pass: t.pass, fail: t.fail, skip: t.skip },
    categories: t.categories,
    failing: t.failing,
    failing_truncated: t.fail > t.failing.length,
  }))
  writeFileSync(join(dir, 'surfaces.json'), JSON.stringify({
    date, lumen_sha: shaFor(i),
    node_version: 'v24.11.1', bun_version: '1.3.10',
    ...s,
  }))
})

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))
console.log(`wrote ${N} nights to ${OUT}`)
