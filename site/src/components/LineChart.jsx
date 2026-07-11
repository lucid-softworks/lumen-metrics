import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { fmtDate, fmtDateLong } from '../lib/format.js'

function useWidth(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function niceTicks(min, max, n = 4) {
  const span = max - min || 1
  const step0 = span / n
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5) || mag * 10
  const lo = Math.ceil(min / step) * step
  const ticks = []
  for (let v = lo; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

/**
 * Multi-series line chart.
 * series: [{ key, label, color, values: (number|null)[] }] — values aligned to dates[]
 * dates: ISO date strings (x positions)
 * yDomain: [min,max] or 'auto'
 */
export default function LineChart({
  title, caption, series, dates, yDomain = 'auto', yFmt = (v) => String(v),
  height = 260, area = false, tableCaption,
}) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hover, setHover] = useState(null) // date index
  const [showTable, setShowTable] = useState(false)
  const multi = series.length > 1

  const M = { top: 14, right: multi ? 118 : 40, bottom: 26, left: 46 }
  const iw = Math.max(width - M.left - M.right, 40)
  const ih = height - M.top - M.bottom

  const allVals = series.flatMap((s) => s.values).filter((v) => v != null)
  let [y0, y1] = yDomain === 'auto'
    ? [Math.min(...allVals), Math.max(...allVals)]
    : yDomain
  if (yDomain === 'auto') {
    const pad = (y1 - y0 || 1) * 0.08
    y0 = Math.max(0, y0 - pad)
    y1 = y1 + pad
  }

  const x = (i) => M.left + (dates.length < 2 ? 0 : (i / (dates.length - 1)) * iw)
  const y = (v) => M.top + (1 - (v - y0) / (y1 - y0 || 1)) * ih
  const ticks = niceTicks(y0, y1)

  // x labels: as many as fit without colliding (~90px each)
  const nX = Math.max(2, Math.min(6, Math.floor(iw / 90) + 1, dates.length))
  const xTickIdx = Array.from({ length: nX }, (_, k) => Math.round((k / Math.max(nX - 1, 1)) * (dates.length - 1)))

  const paths = series.map((s) => {
    let d = ''
    s.values.forEach((v, i) => {
      if (v == null) return
      d += `${d && s.values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  })

  // direct end labels, collision-resolved top-to-bottom; leader line when nudged
  const endLabels = useMemo(() => {
    if (!multi || !dates.length) return []
    const items = series
      .map((s) => {
        let li = s.values.length - 1
        while (li >= 0 && s.values[li] == null) li--
        return li < 0 ? null : { s, yLine: 0, value: s.values[li], idx: li }
      })
      .filter(Boolean)
    return items
  }, [series, dates, multi])

  const placedLabels = useMemo(() => {
    const MIN = 17
    const items = endLabels
      .map((it) => ({ ...it, yLine: y(it.value), yLabel: y(it.value) }))
      .sort((a, b) => a.yLine - b.yLine)
    for (let i = 1; i < items.length; i++) {
      if (items[i].yLabel - items[i - 1].yLabel < MIN) items[i].yLabel = items[i - 1].yLabel + MIN
    }
    // push back up if we overflowed the bottom
    const over = items.length ? items[items.length - 1].yLabel - (M.top + ih) : 0
    if (over > 0) for (const it of items) it.yLabel -= over
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endLabels, width, y0, y1])

  function pickIndex(clientX) {
    const rect = wrapRef.current.getBoundingClientRect()
    const px = clientX - rect.left - M.left
    const i = Math.round((px / iw) * (dates.length - 1))
    return Math.max(0, Math.min(dates.length - 1, i))
  }

  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const d = e.key === 'ArrowLeft' ? -1 : 1
      setHover((h) => Math.max(0, Math.min(dates.length - 1, (h ?? dates.length - 1) + d)))
    }
    if (e.key === 'Escape') setHover(null)
  }

  // tooltip placement: flip side when near the right edge
  const tipLeft = hover != null && x(hover) > width * 0.62

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</h2>
          {caption && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{caption}</p>}
        </div>
        <button
          onClick={() => setShowTable(!showTable)}
          className="text-[12px] px-2 py-1 rounded-md border cursor-pointer"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-2)', background: showTable ? 'var(--wash)' : 'transparent' }}
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {multi && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" aria-hidden={showTable ? undefined : 'false'}>
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--ink-2)' }}>
              <span className="inline-block w-3.5 h-[2.5px] rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {showTable ? (
        <div className="mt-3 max-h-[300px] overflow-y-auto">
          <table className="w-full text-[12.5px] tnum">
            <caption className="sr-only">{tableCaption || title}</caption>
            <thead>
              <tr className="text-left sticky top-0" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                <th className="py-1 pr-3 font-medium">Night</th>
                {series.map((s) => <th key={s.key} className="py-1 pr-3 font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d} style={{ borderTop: '1px solid var(--grid)', color: 'var(--ink-2)' }}>
                  <td className="py-1 pr-3">{d}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3">{s.values[i] == null ? '—' : yFmt(s.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative mt-2 select-none outline-none"
          style={{ height }}
          tabIndex={0}
          role="img"
          aria-label={`${title}. Interactive chart; use arrow keys to step through nights, or the Table button for values.`}
          onPointerMove={(e) => setHover(pickIndex(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
        >
          {width > 0 && (
            <svg width={width} height={height}>
              {/* gridlines */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
                  <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{yFmt(t)}</text>
                </g>
              ))}
              {/* baseline + x labels */}
              <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} stroke="var(--axis)" strokeWidth="1" />
              {xTickIdx.map((i) => (
                <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmtDate(dates[i])}</text>
              ))}

              {/* area wash (single series only) */}
              {area && !multi && paths[0] && (
                <path
                  d={`${paths[0]}L${x(dates.length - 1)},${y(Math.max(y0, 0))}L${x(0)},${y(Math.max(y0, 0))}Z`}
                  fill={series[0].color} opacity="0.1"
                />
              )}

              {/* crosshair */}
              {hover != null && (
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} stroke="var(--axis)" strokeWidth="1" />
              )}

              {/* lines */}
              {series.map((s, si) => (
                <path key={s.key} d={paths[si]} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              ))}

              {/* hover markers, with surface ring */}
              {hover != null && series.map((s) =>
                s.values[hover] == null ? null : (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                ),
              )}

              {/* end markers + direct labels (leader line when nudged) */}
              {multi && placedLabels.map((it) => (
                <g key={it.s.key}>
                  <circle cx={x(it.idx)} cy={it.yLine} r="4" fill={it.s.color} stroke="var(--surface)" strokeWidth="2" />
                  {Math.abs(it.yLabel - it.yLine) > 7 && (
                    <line x1={x(it.idx) + 6} y1={it.yLine} x2={M.left + iw + 10} y2={it.yLabel} stroke="var(--axis)" strokeWidth="1" />
                  )}
                  <text x={M.left + iw + 14} y={it.yLabel + 3.5} fontSize="11.5" fill="var(--ink-2)">
                    <tspan className="tnum" fontWeight="600" fill="var(--ink)">{yFmt(it.value)}</tspan>
                    <tspan dx="4">{it.s.short || it.s.label}</tspan>
                  </text>
                </g>
              ))}
              {!multi && placeEndValue(series[0], dates, x, y, yFmt)}
            </svg>
          )}

          {/* tooltip: every series at the hovered X, values lead */}
          {hover != null && width > 0 && (
            <div
              className="absolute z-10 pointer-events-none rounded-lg px-3 py-2 text-[12px] shadow-lg"
              style={{
                top: 8,
                left: tipLeft ? undefined : Math.min(x(hover) + 12, width - 170),
                right: tipLeft ? width - x(hover) + 12 : undefined,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                minWidth: 140,
              }}
            >
              <div style={{ color: 'var(--muted)' }}>{fmtDateLong(dates[hover])}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-2 mt-1">
                  <span className="inline-block w-3 h-[2.5px] rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="font-semibold tnum" style={{ color: 'var(--ink)' }}>
                    {s.values[hover] == null ? '—' : yFmt(s.values[hover])}
                  </span>
                  <span style={{ color: 'var(--ink-2)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// single-series: label the endpoint value only (selective direct labeling)
function placeEndValue(s, dates, x, y, yFmt) {
  if (!s) return null
  let li = s.values.length - 1
  while (li >= 0 && s.values[li] == null) li--
  if (li < 0) return null
  return (
    <g>
      <circle cx={x(li)} cy={y(s.values[li])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
      <text x={x(li) + 8} y={y(s.values[li]) + 3.5} fontSize="11.5" fontWeight="600" fill="var(--ink)" className="tnum">
        {yFmt(s.values[li])}
      </text>
    </g>
  )
}
