import { useState } from 'react'
import { Routes, Route, Navigate, NavLink, Link } from 'react-router-dom'
import { useIndex } from './lib/data.js'
import { fmtDateLong } from './lib/format.js'
import Conformance from './pages/Conformance.jsx'
import Performance from './pages/Performance.jsx'
import RangeFilter from './components/RangeFilter.jsx'

const PAGES = [
  ['/conformance', 'Conformance'],
  ['/performance', 'Performance'],
]

export default function App() {
  const { data: index, error } = useIndex()
  const [range, setRange] = useState('90')
  const last = index?.nights[index.nights.length - 1]

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 py-5">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full" style={{ background: 'var(--s1)', boxShadow: '0 0 10px var(--s1)' }} />
          <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
            Lumen <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Metrics</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Pages">
          {PAGES.map(([path, label]) => (
            <NavLink
              key={path}
              to={path}
              className="text-[13.5px] px-3 py-1.5 rounded-md no-underline"
              style={({ isActive }) => ({
                color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                background: isActive ? 'var(--wash)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {last && (
            <span>
              nightly · {fmtDateLong(last.date)} ·{' '}
              <a
                href={`https://github.com/lucid-softworks/lumen/commit/${last.lumen_sha}`}
                className="font-mono underline"
                style={{ color: 'var(--ink-2)' }}
              >
                {last.lumen_sha}
              </a>
            </span>
          )}
          <a href="https://github.com/lucid-softworks/lumen" className="underline" style={{ color: 'var(--ink-2)' }}>GitHub</a>
        </div>
      </header>

      {error && (
        <p className="text-[14px]" style={{ color: 'var(--critical)' }}>
          Failed to load results: {String(error.message || error)}
        </p>
      )}
      {!index && !error && <p className="text-[14px]" style={{ color: 'var(--muted)' }}>Loading results…</p>}

      {index && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <RangeFilter value={range} onChange={setRange} />
          </div>
          <Routes>
            <Route path="/" element={<Navigate to="/conformance" replace />} />
            <Route path="/conformance" element={<Conformance index={index} range={range} />} />
            <Route path="/performance" element={<Performance index={index} range={range} />} />
            <Route path="*" element={<Navigate to="/conformance" replace />} />
          </Routes>
        </>
      )}

      <footer className="mt-10 pt-4 text-[12px] leading-relaxed" style={{ borderTop: '1px solid var(--grid)', color: 'var(--muted)' }}>
        <p>
          Every night, CI builds <a className="underline" style={{ color: 'var(--ink-2)' }} href="https://github.com/lucid-softworks/lumen">lumen</a> at
          the latest commit, runs the full test262 suite plus WinterTC / Node / Bun API-surface probes and the V8 benchmark suite,
          and commits the results to <a className="underline" style={{ color: 'var(--ink-2)' }} href="https://github.com/lucid-softworks/lumen-metrics">lumen-metrics</a>.
          API-surface numbers are name inventories, not behavioral compatibility results.
        </p>
      </footer>
    </div>
  )
}
