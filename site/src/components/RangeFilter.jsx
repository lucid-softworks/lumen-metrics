const PRESETS = [
  ['30', 'Last 30 nights'],
  ['90', 'Last 90 nights'],
  ['all', 'All time'],
]

// One filter row above the charts; scopes everything below it.
export default function RangeFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Date range">
      {PRESETS.map(([v, label]) => {
        const active = v === value
        return (
          <button
            key={v}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            className="text-[12.5px] px-2.5 py-1 rounded-md cursor-pointer"
            style={{
              color: active ? 'var(--ink)' : 'var(--ink-2)',
              background: active ? 'var(--wash)' : 'transparent',
              border: `1px solid ${active ? 'var(--s1)' : 'var(--border)'}`,
              fontWeight: active ? 600 : 400,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
