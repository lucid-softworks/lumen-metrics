// Rebuilds results/index.json — the compact per-night series the site loads —
// from the per-night detail files. Idempotent; run after adding any night.
//
//   node harness/build-index.mjs [--out <results dir>]

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HARNESS = dirname(fileURLToPath(import.meta.url))
const outFlag = process.argv.indexOf('--out')
const RESULTS = resolve(outFlag > -1 ? process.argv[outFlag + 1] : join(HARNESS, '..', 'results'))

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)

const nights = []
const dates = readdirSync(RESULTS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name)
  .sort()

for (const date of dates) {
  const dir = join(RESULTS, date)
  const t262 = readJson(join(dir, 'test262.json'))
  const surfaces = readJson(join(dir, 'surfaces.json'))
  const bench = readJson(join(dir, 'bench.json'))

  const sumModules = (mods) => ({
    names: mods.reduce((s, m) => s + m.have, 0),
    names_total: mods.reduce((s, m) => s + m.total, 0),
    modules_complete: mods.filter((m) => m.have === m.total).length,
    modules_total: mods.length,
  })

  nights.push({
    date,
    lumen_sha: t262?.lumen_sha ?? surfaces?.lumen_sha ?? bench?.lumen_sha ?? null,
    test262_sha: t262?.test262_sha ?? null,
    test262: t262
      ? { pass: t262.total.pass, fail: t262.total.fail, skip: t262.total.skip, total: t262.total.pass + t262.total.fail + t262.total.skip }
      : null,
    wintertc: surfaces?.wintertc
      ? { pass: surfaces.wintertc.supported.length, total: surfaces.wintertc.total }
      : null,
    node: surfaces?.node ? sumModules(surfaces.node.modules) : null,
    bun: surfaces?.bun ? sumModules(surfaces.bun.surfaces) : null,
    // normalize pre-tier bench files ({composite, benches}) to a single default tier
    bench: bench
      ? {
          tiers: bench.tiers ?? { default: { composite: bench.composite, benches: bench.benches } },
          references: bench.references ?? null,
          ejs: bench.ejs ?? null,
        }
      : null,
  })
}

writeFileSync(join(RESULTS, 'index.json'), JSON.stringify({ generated: dates[dates.length - 1] ?? null, nights }))
console.log(`index.json: ${nights.length} nights`)
