// Generates the expected API-surface baselines from the real runtimes installed
// on this machine:
//
//   harness/baselines/node.json — { version, modules: { <name>: [exported names] } }
//   harness/baselines/bun.json  — { version, modules: { bun|bun:ffi|...: [names] } }
//
// Run under Node (it shells out to bun for the bun baseline):
//   node harness/gen-baselines.mjs
//
// Baselines are committed so every night is measured against the same yardstick;
// regenerate deliberately when bumping the reference Node/Bun versions.

import { builtinModules } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'baselines')
mkdirSync(DIR, { recursive: true })

// --- Node ---
const nodeModules = {}
for (const name of builtinModules.filter((m) => !m.startsWith('_')).sort()) {
  const ns = await import(`node:${name}`)
  nodeModules[name] = Object.keys(ns).filter((k) => k !== 'default').sort()
}
writeFileSync(
  join(DIR, 'node.json'),
  JSON.stringify({ version: process.version, modules: nodeModules }, null, 1),
)
console.log(`node ${process.version}: ${Object.keys(nodeModules).length} modules`)

// --- Bun ---
const bunScript = `
const out = { version: Bun.version, modules: {} };
for (const name of ['bun', 'bun:ffi', 'bun:jsc', 'bun:sqlite', 'bun:test']) {
  try {
    const ns = await import(name);
    const names = Object.keys(ns).filter((k) => k !== 'default').sort();
    if (names.length) out.modules[name] = names; // bun:test is empty outside the test runner
  } catch {}
}
console.log(JSON.stringify(out, null, 1));
`
const bunOut = execFileSync('bun', ['-e', bunScript], { encoding: 'utf8' })
writeFileSync(join(DIR, 'bun.json'), bunOut)
const bun = JSON.parse(bunOut)
console.log(`bun ${bun.version}: ${Object.keys(bun.modules).length} modules`)
