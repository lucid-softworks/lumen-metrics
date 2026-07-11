import { sliceRange, spark } from '../lib/data.js'
import { fmtNum } from '../lib/format.js'
import StatTile from '../components/StatTile.jsx'
import LineChart from '../components/LineChart.jsx'
import Sparkline from '../components/Sparkline.jsx'

const BENCH_NAMES = ['Richards', 'DeltaBlue', 'Crypto', 'RayTrace', 'EarleyBoyer', 'RegExp', 'Splay', 'NavierStokes']

export default function Performance({ index, range }) {
  const nights = index.nights
  const view = sliceRange(nights, range)
  const withBench = nights.filter((n) => n.bench)
  const last = withBench[withBench.length - 1]
  const prev = withBench[withBench.length - 2]

  if (!last) {
    return <p className="text-[14px]" style={{ color: 'var(--muted)' }}>No benchmark data yet.</p>
  }

  const composite = (n) => n.bench?.composite ?? null
  const week = withBench[withBench.length - 8]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="V8 suite composite"
          value={fmtNum(last.bench.composite)}
          sub="geometric mean · higher is better"
          delta={prev ? last.bench.composite - prev.bench.composite : null}
          sparkValues={spark(withBench, composite)}
          color="var(--s1)"
        />
        <StatTile
          label="vs 7 nights ago"
          value={week ? `${last.bench.composite > week.bench.composite ? '+' : ''}${(((last.bench.composite - week.bench.composite) / week.bench.composite) * 100).toFixed(1)}%` : '—'}
          sub={week ? `from ${fmtNum(week.bench.composite)}` : ''}
        />
        <BestMoverTile last={last} week={week} />
      </div>

      <LineChart
        title="Composite score, nightly"
        caption="V8 v7 benchmark suite (Richards, DeltaBlue, Crypto, RayTrace, EarleyBoyer, RegExp, Splay, NavierStokes). Scores from shared CI runners vary run-to-run; judge the trend, not single nights."
        series={[{ key: 'composite', label: 'Composite', color: 'var(--s1)', values: view.map(composite) }]}
        dates={view.map((n) => n.date)}
        yFmt={(v) => fmtNum(Math.round(v))}
        height={260}
        area
      />

      <section>
        <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--ink)' }}>Per benchmark</h2>
        <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>
          Each panel has its own scale — compare shapes, not heights.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENCH_NAMES.map((name) => (
            <LineChart
              key={name}
              title={name}
              series={[{ key: name, label: name, color: 'var(--s1)', values: view.map((n) => n.bench?.benches?.[name] ?? null) }]}
              dates={view.map((n) => n.date)}
              yFmt={(v) => fmtNum(Math.round(v))}
              height={140}
            />
          ))}
        </div>
      </section>

      <LatestRunTable withBench={withBench} last={last} prev={prev} week={week} />
    </div>
  )
}

function BestMoverTile({ last, week }) {
  if (!week) return null
  let best = null
  for (const name of BENCH_NAMES) {
    const a = week.bench.benches[name]
    const b = last.bench.benches[name]
    if (a && b) {
      const d = ((b - a) / a) * 100
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { name, d }
    }
  }
  if (!best) return null
  return (
    <StatTile
      label="Biggest 7-night mover"
      value={best.name}
      sub={`${best.d > 0 ? '+' : ''}${best.d.toFixed(1)}%`}
    />
  )
}

function LatestRunTable({ withBench, last, prev, week }) {
  return (
    <section className="card p-4">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Latest run — {last.date}</h2>
      <table className="w-full mt-3 text-[12.5px] max-w-[720px]">
        <thead>
          <tr className="text-left" style={{ color: 'var(--muted)' }}>
            <th className="py-1 pr-2 font-medium">Benchmark</th>
            <th className="py-1 pr-2 font-medium text-right">Score</th>
            <th className="py-1 pr-2 font-medium text-right">Δ 1 night</th>
            <th className="py-1 pr-2 font-medium text-right">Δ 7 nights</th>
            <th className="py-1 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody className="tnum">
          {BENCH_NAMES.map((name) => {
            const cur = last.bench.benches[name]
            const d1 = prev ? cur - prev.bench.benches[name] : null
            const d7 = week ? cur - week.bench.benches[name] : null
            return (
              <tr key={name} style={{ borderTop: '1px solid var(--grid)' }}>
                <td className="py-1.5 pr-2" style={{ color: 'var(--ink)' }}>{name}</td>
                <td className="py-1.5 pr-2 text-right font-semibold" style={{ color: 'var(--ink)' }}>{fmtNum(cur)}</td>
                <DeltaCell d={d1} />
                <DeltaCell d={d7} />
                <td className="py-1.5">
                  <Sparkline values={spark(withBench, (n) => n.bench.benches[name])} color="var(--s1)" width={80} height={22} />
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
