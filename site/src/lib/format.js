export const fmtNum = (n) => n.toLocaleString('en-US')

export const fmtPct = (n, digits = 2) =>
  `${n.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%`

export const pct = (pass, total) => (total === 0 ? 0 : (pass / total) * 100)

export const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

export const fmtDateLong = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

export const fmtDelta = (d, digits = 2) => {
  if (d === 0) return '±0'
  const s = Math.abs(d) < 0.005 && digits > 0 ? d.toFixed(3) : d.toFixed(digits)
  return `${d > 0 ? '+' : '−'}${Math.abs(Number(s)).toString()}`
}
