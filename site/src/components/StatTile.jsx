import Sparkline from './Sparkline.jsx'

// Stat tile contract: label · value (semibold, proportional figures) ·
// delta (signed, vs previous night, colored by direction) · sparkline.
export default function StatTile({ label, value, sub, delta, deltaLabel = 'vs prev night', goodIsUp = true, sparkValues, color }) {
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1
  const good = dir !== 0 && (dir > 0) === goodIsUp
  return (
    <div className="card flex-1 min-w-[180px] px-4 py-3">
      <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{label}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <span className="text-[26px] font-semibold leading-none" style={{ color: 'var(--ink)' }}>{value}</span>
          {sub && <span className="ml-1.5 text-[13px]" style={{ color: 'var(--muted)' }}>{sub}</span>}
        </div>
        {sparkValues && <Sparkline values={sparkValues} color={color} />}
      </div>
      {delta !== undefined && (
        <div className="mt-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
          {dir !== 0 ? (
            <>
              <span className="font-medium" style={{ color: good ? 'var(--delta-up)' : 'var(--delta-down)' }}>
                {dir > 0 ? '▲' : '▼'} {Math.abs(delta)}
              </span>{' '}
              {deltaLabel}
            </>
          ) : (
            <span>no change {deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
