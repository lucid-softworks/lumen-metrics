// Coverage meter: sequential-blue fill on a lighter step of the same ramp.
export default function Meter({ value, width = 120 }) {
  return (
    <span
      className="inline-block h-[7px] rounded-full align-middle overflow-hidden"
      style={{ width, background: 'var(--seq-track)' }}
      role="presentation"
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: 'var(--seq-fill)' }}
      />
    </span>
  )
}
