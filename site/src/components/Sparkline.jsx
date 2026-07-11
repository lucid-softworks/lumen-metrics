// 12-point sparkline for stat tiles: de-emphasis stroke, current point in accent.
export default function Sparkline({ values, width = 96, height = 28, color = 'var(--s1)' }) {
  const vals = values.filter((v) => v != null)
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const px = 3 // padding so the end dot isn't clipped
  const x = (i) => px + (i / (vals.length - 1)) * (width - 2 * px)
  const y = (v) => px + (1 - (v - min) / span) * (height - 2 * px)
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke="var(--axis)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  )
}
