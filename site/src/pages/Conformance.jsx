import { useMemo, useState } from 'react'
import { sliceRange, spark, useNight } from '../lib/data.js'
import { fmtNum, fmtPct, pct, fmtDate } from '../lib/format.js'
import StatTile from '../components/StatTile.jsx'
import LineChart from '../components/LineChart.jsx'
import Meter from '../components/Meter.jsx'

const SERIES_DEFS = [
  { key: 'test262', label: 'test262', short: 'test262', color: 'var(--s1)', get: (n) => pct(n.test262.pass, n.test262.pass + n.test262.fail) },
  { key: 'wintertc', label: 'WinterTC', short: 'WinterTC', color: 'var(--s2)', get: (n) => pct(n.wintertc.pass, n.wintertc.total) },
  { key: 'node', label: 'Node surface', short: 'Node', color: 'var(--s3)', get: (n) => pct(n.node.names, n.node.names_total) },
  { key: 'bun', label: 'Bun surface', short: 'Bun', color: 'var(--s4)', get: (n) => pct(n.bun.names, n.bun.names_total) },
]

export default function Conformance({ index, range }) {
  const nights = index.nights
  const view = sliceRange(nights, range)
  const last = nights[nights.length - 1]
  const prev = nights[nights.length - 2]

  const t262Pct = (n) => pct(n.test262.pass, n.test262.pass + n.test262.fail)

  const trendSeries = SERIES_DEFS.map((d) => ({
    key: d.key, label: d.label, short: d.short, color: d.color,
    values: view.map((n) => Number(d.get(n).toFixed(2))),
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="test262 conformance"
          value={fmtPct(t262Pct(last))}
          sub={`${fmtNum(last.test262.pass)} / ${fmtNum(last.test262.pass + last.test262.fail)}`}
          delta={prev ? last.test262.fail - prev.test262.fail : undefined}
          deltaLabel={prev && last.test262.fail !== prev.test262.fail ? 'failures vs prev night' : 'vs prev night'}
          goodIsUp={false}
          sparkValues={spark(nights, t262Pct)}
          color="var(--s1)"
        />
        <StatTile
          label="WinterTC minimum API"
          value={`${last.wintertc.pass}/${last.wintertc.total}`}
          sub="globals"
          delta={prev ? last.wintertc.pass - prev.wintertc.pass : undefined}
          sparkValues={spark(nights, (n) => n.wintertc.pass)}
          color="var(--s2)"
        />
        <StatTile
          label="Node API surface"
          value={fmtPct(pct(last.node.names, last.node.names_total), 1)}
          sub={`${fmtNum(last.node.names)} / ${fmtNum(last.node.names_total)} names`}
          delta={prev ? last.node.names - prev.node.names : undefined}
          sparkValues={spark(nights, (n) => n.node.names)}
          color="var(--s3)"
        />
        <StatTile
          label="Bun API surface"
          value={fmtPct(pct(last.bun.names, last.bun.names_total), 1)}
          sub={`${fmtNum(last.bun.names)} / ${fmtNum(last.bun.names_total)} names`}
          delta={prev ? last.bun.names - prev.bun.names : undefined}
          sparkValues={spark(nights, (n) => n.bun.names)}
          color="var(--s4)"
        />
      </div>

      <LineChart
        title="Suite progress"
        caption="Pass rate per suite, nightly. API-surface suites are name inventories, not behavioral results."
        series={trendSeries}
        dates={view.map((n) => n.date)}
        yDomain={[0, 100]}
        yFmt={(v) => fmtPct(v, v === Math.round(v) ? 0 : 2)}
        height={280}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryTable date={last.date} prevDate={prev?.date} />
        <DiffPanel date={last.date} prevDate={prev?.date} />
      </div>

      <SurfacePanel date={last.date} />
    </div>
  )
}

function CategoryTable({ date, prevDate }) {
  const cur = useNight(date, 'test262')
  const prevN = useNight(prevDate, 'test262')
  const rows = useMemo(() => {
    if (!cur) return null
    return Object.entries(cur.categories)
      .map(([name, c]) => {
        const p = prevN?.categories?.[name]
        return {
          name, ...c,
          pct: pct(c.pass, c.pass + c.fail),
          delta: p ? (c.pass - p.pass) : null,
        }
      })
      .sort((a, b) => a.pct - b.pct || b.fail - a.fail)
  }, [cur, prevN])

  return (
    <section className="card p-4">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>test262 by category</h2>
      <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
        Latest night, weakest first. Δ is passing tests gained vs the previous night.
      </p>
      {!rows ? <Loading /> : (
        <table className="w-full mt-3 text-[12.5px]">
          <thead>
            <tr className="text-left" style={{ color: 'var(--muted)' }}>
              <th className="py-1 pr-2 font-medium">Category</th>
              <th className="py-1 pr-2 font-medium text-right">Pass</th>
              <th className="py-1 pr-2 font-medium text-right">Fail</th>
              <th className="py-1 pr-2 font-medium w-[130px]">Rate</th>
              <th className="py-1 font-medium text-right">Δ</th>
            </tr>
          </thead>
          <tbody className="tnum">
            {rows.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid var(--grid)' }}>
                <td className="py-1.5 pr-2" style={{ color: 'var(--ink)' }}>{r.name}</td>
                <td className="py-1.5 pr-2 text-right" style={{ color: 'var(--ink-2)' }}>{fmtNum(r.pass)}</td>
                <td className="py-1.5 pr-2 text-right" style={{ color: r.fail ? 'var(--ink)' : 'var(--muted)', fontWeight: r.fail ? 600 : 400 }}>
                  {fmtNum(r.fail)}
                </td>
                <td className="py-1.5 pr-2">
                  <Meter value={r.pct} width={84} />
                  <span className="ml-2" style={{ color: 'var(--ink-2)' }}>{fmtPct(r.pct, r.pct >= 99.99 ? 0 : 2)}</span>
                </td>
                <td className="py-1.5 text-right" style={{ color: r.delta > 0 ? 'var(--delta-up)' : r.delta < 0 ? 'var(--delta-down)' : 'var(--muted)' }}>
                  {r.delta == null || r.delta === 0 ? '·' : `${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function DiffPanel({ date, prevDate }) {
  const cur = useNight(date, 'test262')
  const prevN = useNight(prevDate, 'test262')
  const diff = useMemo(() => {
    if (!cur || !prevN) return null
    const curSet = new Set(cur.failing)
    const prevSet = new Set(prevN.failing)
    return {
      regressions: cur.failing.filter((t) => !prevSet.has(t)),
      fixed: prevN.failing.filter((t) => !curSet.has(t)),
      truncated: cur.failing_truncated || prevN.failing_truncated,
    }
  }, [cur, prevN])

  return (
    <section className="card p-4">
      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>What changed last night</h2>
      <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
        test262 failing-set diff, {prevDate ? fmtDate(prevDate) : '—'} → {fmtDate(date)}.
      </p>
      {!diff ? <Loading /> : (
        <div className="mt-3 flex flex-col gap-4">
          <DiffList
            icon="✕" tone="var(--critical)"
            title={`New failures (${diff.regressions.length})`}
            items={diff.regressions}
            empty="No new failures — clean night."
          />
          <DiffList
            icon="✓" tone="var(--good)"
            title={`Newly passing (${diff.fixed.length})`}
            items={diff.fixed}
            empty="Nothing newly passing."
          />
          {diff.truncated && (
            <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
              Failing lists were sampled on one of these nights, so this diff is partial.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function DiffList({ icon, tone, title, items, empty }) {
  const MAX = 12
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, MAX)
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
        <span aria-hidden="true" className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full text-[10px] font-bold"
          style={{ background: tone, color: '#fff' }}>{icon}</span>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] mt-1 ml-6" style={{ color: 'var(--muted)' }}>{empty}</p>
      ) : (
        <ul className="mt-1 ml-6 flex flex-col gap-0.5">
          {shown.map((t) => (
            <li key={t} className="text-[12px] font-mono break-all" style={{ color: 'var(--ink-2)' }}>{t}</li>
          ))}
          {items.length > MAX && (
            <li>
              <button onClick={() => setExpanded(!expanded)} className="text-[12px] cursor-pointer underline" style={{ color: 'var(--muted)' }}>
                {expanded ? 'show fewer' : `show all ${items.length}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function SurfacePanel({ date }) {
  const surfaces = useNight(date, 'surfaces')
  const [showAllNode, setShowAllNode] = useState(false)

  if (!surfaces) return <section className="card p-4"><Loading /></section>

  const nodeRows = [...surfaces.node.modules].sort((a, b) => (a.have / a.total) - (b.have / b.total) || (b.total - b.have) - (a.total - a.have))
  const nodeIncomplete = nodeRows.filter((m) => m.have < m.total)
  const shownNode = showAllNode ? nodeRows : nodeRows.slice(0, 12)
  const wtc = surfaces.wintertc

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Node module surface</h2>
        <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
          Exported names present per module vs Node {surfaces.node_version} — an API-name inventory, not behavioral compatibility. Largest gaps first.
        </p>
        <SurfaceTable rows={shownNode} />
        <div className="mt-2 flex items-baseline justify-between">
          <button onClick={() => setShowAllNode(!showAllNode)} className="text-[12px] cursor-pointer underline" style={{ color: 'var(--muted)' }}>
            {showAllNode ? 'show top 12' : `show all ${nodeRows.length} modules`}
          </button>
          <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
            {nodeIncomplete.length === 0 ? 'all modules complete' : `${nodeIncomplete.length} modules incomplete`}
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card p-4">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Bun surface</h2>
          <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
            vs Bun {surfaces.bun_version} — name inventory.
          </p>
          <SurfaceTable rows={surfaces.bun.surfaces} />
        </section>

        <section className="card p-4">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>WinterTC Minimum Common API</h2>
          {wtc.missing.length === 0 ? (
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--ink-2)' }}>
              <span className="font-semibold" style={{ color: 'var(--delta-up)' }}>✓ All {wtc.supported.length} required globals implemented.</span>
            </p>
          ) : (
            <>
              <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{wtc.missing.length} globals missing:</p>
              <p className="mt-1.5 text-[12px] font-mono leading-relaxed" style={{ color: 'var(--ink-2)' }}>{wtc.missing.join(', ')}</p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function SurfaceTable({ rows }) {
  return (
    <table className="w-full mt-3 text-[12.5px]">
      <thead>
        <tr className="text-left" style={{ color: 'var(--muted)' }}>
          <th className="py-1 pr-2 font-medium">Module</th>
          <th className="py-1 pr-2 font-medium text-right">Coverage</th>
          <th className="py-1 pr-2 font-medium w-[110px]">&nbsp;</th>
          <th className="py-1 font-medium text-right">Missing</th>
        </tr>
      </thead>
      <tbody className="tnum">
        {rows.map((m) => (
          <tr key={m.name} style={{ borderTop: '1px solid var(--grid)' }}>
            <td className="py-1.5 pr-2 font-mono text-[12px]" style={{ color: 'var(--ink)' }}>{m.name}</td>
            <td className="py-1.5 pr-2 text-right" style={{ color: 'var(--ink-2)' }}>{m.have}/{m.total}</td>
            <td className="py-1.5 pr-2"><Meter value={pct(m.have, m.total)} width={96} /></td>
            <td className="py-1.5 text-right" style={{ color: m.total - m.have ? 'var(--ink)' : 'var(--muted)', fontWeight: m.total - m.have ? 600 : 400 }}>
              {m.total - m.have}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Loading() {
  return <p className="text-[13px] mt-3" style={{ color: 'var(--muted)' }}>Loading…</p>
}
