import { sliceRange, spark } from '../lib/data.js'
import { fmtNum } from '../lib/format.js'
import StatTile from '../components/StatTile.jsx'
import LineChart from '../components/LineChart.jsx'
import Sparkline from '../components/Sparkline.jsx'

const BENCH_NAMES = ['Richards', 'DeltaBlue', 'Crypto', 'RayTrace', 'EarleyBoyer', 'RegExp', 'Splay', 'NavierStokes']

// fixed slot per tier — color follows the entity across every chart
const TIER_DEFS = [
  { key: 'jit', label: 'jit', color: 'var(--s1)' },
  { key: 'bytecode', label: 'bytecode', color: 'var(--s2)' },
  { key: 'interp', label: 'interp', color: 'var(--s3)' },
  { key: 'default', label: 'default', color: 'var(--s4)' },
]
const tierResult = (n, key) => n.bench?.tiers?.[key] ?? null
const topTierKey = (n) => TIER_DEFS.find((t) => tierResult(n, t.key))?.key ?? null

export default function Performance({ index, range }) {
  const nights = index.nights
  const view = sliceRange(nights, range)
  const withBench = nights.filter((n) => n.bench)
  const last = withBench[withBench.length - 1]

  if (!last) {
    return <p className="text-[14px]" style={{ color: 'var(--muted)' }}>No benchmark data yet.</p>
  }

  const top = topTierKey(last)
  const topDef = TIER_DEFS.find((t) => t.key === top)
  // compare like with like: deltas are always within the same tier
  const sameTier = withBench.filter((n) => tierResult(n, top))
  const prev = sameTier[sameTier.length - 2]
  const week = sameTier[sameTier.length - 8]
  const composite = (key) => (n) => tierResult(n, key)?.composite ?? null

  const activeTiers = TIER_DEFS.filter((t) => view.some((n) => tierResult(n, t.key)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <StatTile
          label={`V8 composite (${topDef.label} tier)`}
          value={fmtNum(tierResult(last, top).composite)}
          sub="geomean · higher is better"
          delta={prev ? tierResult(last, top).composite - tierResult(prev, top).composite : undefined}
          sparkValues={spark(sameTier, composite(top))}
          color={topDef.color}
        />
        <StatTile
          label={`vs 7 nights ago (${topDef.label})`}
          value={week ? `${tierResult(last, top).composite > tierResult(week, top).composite ? '+' : ''}${(((tierResult(last, top).composite - tierResult(week, top).composite) / tierResult(week, top).composite) * 100).toFixed(1)}%` : '—'}
          sub={week ? `from ${fmtNum(tierResult(week, top).composite)}` : 'not enough nights'}
        />
        <TierSpreadTile last={last} />
      </div>

      <LineChart
        title="Composite score by tier, nightly"
        caption="V8 v7 suite geomean per execution tier. The jit series starts the night the tier landed. Scores from repeated runs vary a few percent; judge trends, not single nights."
        series={activeTiers.map((t) => ({
          key: t.key, label: t.label, short: t.label, color: t.color,
          values: view.map(composite(t.key)),
        }))}
        dates={view.map((n) => n.date)}
        yFmt={(v) => fmtNum(Math.round(v))}
        height={280}
      />

      <section>
        <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Per benchmark — {topDef.label} tier</h2>
        <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>
          Each panel has its own scale — compare shapes, not heights. Per-tier numbers for the latest run are in the table below.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENCH_NAMES.map((name) => (
            <LineChart
              key={name}
              title={name}
              series={[{ key: name, label: name, color: topDef.color, values: view.map((n) => tierResult(n, topTierKey(n))?.benches?.[name] ?? null) }]}
              dates={view.map((n) => n.date)}
              yFmt={(v) => fmtNum(Math.round(v))}
              height={140}
            />
          ))}
        </div>
      </section>

      <LatestRunTable last={last} prev={prev} activeTiers={activeTiers} top={top} sameTier={sameTier} />
    </div>
  )
}

function TierSpreadTile({ last }) {
  const interp = tierResult(last, 'interp')
  const top = topTierKey(last)
  const topR = tierResult(last, top)
  if (!interp || top === 'interp' || !topR) return null
  return (
    <StatTile
      label={`${top} speedup over interp`}
      value={`${(topR.composite / interp.composite).toFixed(1)}×`}
      sub={`${fmtNum(interp.composite)} → ${fmtNum(topR.composite)}`}
    />
  )
}

function LatestRunTable({ last, prev, activeTiers, top, sameTier }) {
  const latestTiers = activeTiers.filter((t) => tierResult(last, t.key))
  return (
    <section className="card p-4">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Latest run — {last.date}</h2>
      <table className="w-full mt-3 text-[12.5px] max-w-[780px]">
        <thead>
          <tr className="text-left" style={{ color: 'var(--muted)' }}>
            <th className="py-1 pr-2 font-medium">Benchmark</th>
            {latestTiers.map((t) => (
              <th key={t.key} className="py-1 pr-2 font-medium text-right">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-[2.5px] rounded-full" style={{ background: t.color }} />
                  {t.label}
                </span>
              </th>
            ))}
            <th className="py-1 pr-2 font-medium text-right">Δ 1 night ({top})</th>
            <th className="py-1 font-medium">Trend ({top})</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {BENCH_NAMES.map((name) => {
            const cur = tierResult(last, top)?.benches?.[name]
            const d1 = prev != null && cur != null ? cur - (tierResult(prev, top)?.benches?.[name] ?? cur) : null
            return (
              <tr key={name} style={{ borderTop: '1px solid var(--grid)' }}>
                <td className="py-1.5 pr-2" style={{ color: 'var(--ink)' }}>{name}</td>
                {latestTiers.map((t) => (
                  <td key={t.key} className="py-1.5 pr-2 text-right" style={{ color: t.key === top ? 'var(--ink)' : 'var(--ink-2)', fontWeight: t.key === top ? 600 : 400 }}>
                    {tierResult(last, t.key)?.benches?.[name] != null ? fmtNum(tierResult(last, t.key).benches[name]) : '—'}
                  </td>
                ))}
                <DeltaCell d={d1} />
                <td className="py-1.5">
                  <Sparkline values={spark(sameTier, (n) => tierResult(n, top)?.benches?.[name] ?? null)} color="var(--s1)" width={80} height={22} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>
        Higher is better. Single-night deltas within a few percent are runner noise.
      </p>
    </section>
  )
}

function DeltaCell({ d }) {
  return (
    <td className="py-1.5 pr-2 text-right" style={{ color: d > 0 ? 'var(--delta-up)' : d < 0 ? 'var(--delta-down)' : 'var(--muted)' }}>
      {d == null || d === 0 ? '·' : `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}`}
    </td>
  )
}
