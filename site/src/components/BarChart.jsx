import { useState } from 'react'
import { fmtNum } from '../lib/format.js'

/**
 * Horizontal bar chart for magnitude comparison.
 * rows: [{ key, label, sub, value, color, emphasis }] — pre-sorted by caller.
 * detail: optional { columns: [name], rows: [{ label, values: [] }] } for the table view.
 */
export default function BarChart({ title, caption, rows, detail, height = 26 }) {
  const [showTable, setShowTable] = useState(false)
  const [hover, setHover] = useState(null)
  const max = Math.max(...rows.map((r) => r.value)) || 1

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
          {caption && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{caption}</p>}
        </div>
        {detail && (
          <button
            onClick={() => setShowTable(!showTable)}
            className="text-[12px] px-2 py-1 rounded-md border cursor-pointer shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: showTable ? 'var(--wash)' : 'transparent' }}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      {showTable && detail ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12.5px] tnum">
            <thead>
              <tr className="text-left" style={{ color: 'var(--muted)' }}>
                <th className="py-1 pr-3 font-medium">Benchmark</th>
                {detail.columns.map((c) => <th key={c} className="py-1 pr-3 font-medium text-right">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((r) => (
                <tr key={r.label} style={{ borderTop: '1px solid var(--grid)' }}>
                  <td className="py-1 pr-3" style={{ color: 'var(--ink)' }}>{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className="py-1 pr-3 text-right" style={{ color: 'var(--ink-2)' }}>{v == null ? '—' : fmtNum(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-[6px]">
          {rows.map((r) => {
            const w = Math.max((r.value / max) * 100, 0.4)
            const hovered = hover === r.key
            return (
              <div
                key={r.key}
                className="flex items-center gap-3"
                onPointerEnter={() => setHover(r.key)}
                onPointerLeave={() => setHover(null)}
              >
                <span className="w-[130px] shrink-0 text-right text-[12.5px] leading-tight" style={{ color: r.emphasis ? 'var(--ink)' : 'var(--ink-2)', fontWeight: r.emphasis ? 600 : 400 }}>
                  {r.label}
                  {r.sub && <span className="block text-[11px] font-normal" style={{ color: 'var(--muted)' }}>{r.sub}</span>}
                </span>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span
                    className="block rounded-r-[4px]"
                    style={{
                      width: `${w}%`,
                      height,
                      background: r.color,
                      opacity: r.emphasis ? 1 : hovered ? 0.75 : 0.55,
                      transition: 'opacity 120ms',
                    }}
                  />
                  <span className="text-[12px] font-semibold tnum shrink-0" style={{ color: 'var(--ink)' }}>{fmtNum(r.value)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
