import { useEffect, useState } from 'react'

const base = import.meta.env.BASE_URL

const cache = new Map()
async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path)
  const p = fetch(base + path).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${path}`)
    return r.json()
  })
  cache.set(path, p)
  return p
}

export function useIndex() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    fetchJson('results/index.json').then(setData, setError)
  }, [])
  return { data, error }
}

export function useNight(date, file) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    if (date) fetchJson(`results/${date}/${file}.json`).then((d) => live && setData(d), () => {})
    return () => { live = false }
  }, [date, file])
  return data
}

// slice the nights array to the selected range ("30" | "90" | "all")
export function sliceRange(nights, range) {
  if (!nights) return []
  if (range === 'all') return nights
  return nights.slice(-Number(range))
}

// last N values of a metric, for stat-tile sparklines
export function spark(nights, get, n = 12) {
  return nights.slice(-n).map(get)
}
