import { useState, useRef, useEffect } from 'react'
import { fetchSeriesByDate, fetchSeriesState } from '../api/grid.js'
import { findBestMatch, parsePolymarketSlug } from '../utils/matching.js'

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return null
  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1).map((line, i) => {
    const values = parseCSVLine(line)
    const row = { _idx: i }
    headers.forEach((h, j) => { row[h] = values[j] ?? '' })
    return row
  })
  return { headers, rows }
}

// "Counter-Strike: Team1 vs Team2 (BO3) - Tournament"  →  { team1, team2 }
function parseEventTitle(eventTitle) {
  const colonIdx = eventTitle.indexOf(': ')
  const rest = colonIdx >= 0 ? eventTitle.slice(colonIdx + 2) : eventTitle
  const vsIdx = rest.indexOf(' vs ')
  if (vsIdx < 0) return null
  const team1 = rest.slice(0, vsIdx).trim()
  const afterVs = rest.slice(vsIdx + 4)
  const boIdx = afterVs.indexOf(' (BO')
  const team2 = (boIdx >= 0 ? afterVs.slice(0, boIdx) : afterVs).trim()
  return { team1, team2 }
}

// "Map 3: Odd/Even Total Kills?"  →  3
function parseMapIndex(title) {
  const m = title.match(/Map\s+(\d+)/i)
  return m ? parseInt(m[1]) : null
}

// "cs2-arc-mf-2026-03-13"  →  "2026-03-13"
// Works on both event_slug (date at the end) and market_slug (date in the middle)
function parseDateFromSlug(slug) {
  const m = slug.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// "cs2-mouzn-unity-2026-03-06-game1-odd-even-total-kills"  →  "cs2-mouzn-unity-2026-03-06"
// Strips everything after the date so it can be used like an event_slug
function stripToEventSlug(slug) {
  const m = slug.match(/^(.+?\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function escapeCsvField(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MATCH_THRESHOLD = 60
const DATE_DELAY_MS  = 1500  // pause before each new date query (rate-limit protection)
const STATE_DELAY_MS = 1000  // pause before each new series-state query

// ─── Component ───────────────────────────────────────────────────────────────

export default function BatchTab() {
  const [csvData, setCsvData] = useState(null)   // { headers, rows }
  const [results, setResults] = useState({})      // { rowIdx: { status, totalKills, parity, error } }
  const [processing, setProcessing] = useState(false)
  const [filter, setFilter] = useState('pending')
  const [currentRow, setCurrentRow] = useState(null)   // idx of row being processed
  const fileRef      = useRef(null)
  const rowRefs      = useRef({})    // idx → <tr> DOM element (for auto-scroll)
  const consoleEndRef = useRef(null) // bottom sentinel of error console

  // Caches persist for the lifetime of the uploaded file
  const dateCache  = useRef({})   // date   → seriesList
  const stateCache = useRef({})   // seriesId → state

  // Auto-scroll table to the row currently being processed
  useEffect(() => {
    if (currentRow != null) {
      rowRefs.current[currentRow]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentRow])

  // Auto-scroll error console to the latest entry whenever results change
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [results])

  // ── File upload ──────────────────────────────────────────────────────────

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result)
      if (parsed) {
        setCsvData(parsed)
        setResults({})
        dateCache.current  = {}
        stateCache.current = {}
      }
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = '' // allow re-upload of same file
  }

  function isPending(row) {
    return row.oo_raw_status === 'request_open'
  }

  // ── Process single row ───────────────────────────────────────────────────

  async function processRow(row) {
    // Resolve the effective event slug: prefer event_slug, fall back to market_slug stripped to date
    const rawSlug = row.event_slug?.trim()
      || stripToEventSlug(row.market_slug?.trim() || '')
      || ''
    const date = parseDateFromSlug(rawSlug)
    if (!date) return { status: 'error', error: 'Cannot parse date from event_slug or market_slug' }

    // Try full team names from event_title first; fall back to slug abbreviations
    let teams = parseEventTitle(row.event_title || '')
    if (!teams) {
      const parsed = parsePolymarketSlug(rawSlug)
      if (parsed) teams = { team1: parsed.hint1, team2: parsed.hint2 }
    }
    if (!teams) return { status: 'error', error: 'Cannot parse teams from event_title or slug' }

    const mapIndex = parseMapIndex(row.title || '')
    if (!mapIndex) return { status: 'error', error: 'Cannot parse map number from title' }

    // Fetch series list (cached per date) — throttle uncached requests
    if (!dateCache.current[date]) {
      try {
        await new Promise(r => setTimeout(r, DATE_DELAY_MS))
        const result = await fetchSeriesByDate(date)
        dateCache.current[date] = result.edges.map(e => e.node)
      } catch (err) {
        return { status: 'error', error: `Date query failed: ${err.message}` }
      }
    }
    const seriesList = dateCache.current[date]

    // Match series using full team names from event_title
    const best = findBestMatch(teams.team1, teams.team2, seriesList)
    if (!best || best.score < MATCH_THRESHOLD || !best.bothMatched) {
      return {
        status: 'error',
        error: `No match for "${teams.team1} vs ${teams.team2}" on ${date}`
      }
    }

    // Fetch series state (cached per series)
    const seriesId = best.series.id
    if (!stateCache.current[seriesId]) {
      try {
        await new Promise(r => setTimeout(r, STATE_DELAY_MS))
        stateCache.current[seriesId] = await fetchSeriesState(seriesId)
      } catch (err) {
        return { status: 'error', error: `Series state failed: ${err.message}` }
      }
    }
    const state = stateCache.current[seriesId]

    // Find the specific game/map
    const game = state?.games?.find(g => g.sequenceNumber === mapIndex && g.finished)
    if (!game) {
      return { status: 'error', error: `Map ${mapIndex} not found or not finished` }
    }

    const totalKills = (game.teams?.[0]?.kills ?? 0) + (game.teams?.[1]?.kills ?? 0)
    return {
      status: 'done',
      totalKills,
      parity: totalKills % 2 === 0 ? 'Even' : 'Odd'
    }
  }

  // ── Process all pending ──────────────────────────────────────────────────

  async function processAll() {
    if (!csvData || processing) return
    setProcessing(true)

    const pending = csvData.rows.filter(isPending)
    for (const row of pending) {
      setCurrentRow(row._idx)
      setResults(prev => ({ ...prev, [row._idx]: { status: 'loading' } }))
      const result = await processRow(row)
      setResults(prev => ({ ...prev, [row._idx]: result }))
    }

    setCurrentRow(null)
    setProcessing(false)
  }

  // ── Download enriched CSV ────────────────────────────────────────────────

  function downloadCSV() {
    if (!csvData) return
    const newHeaders = ['total_kills', 'kills_parity']
    const allHeaders = [...csvData.headers, ...newHeaders]
    const lines = [
      allHeaders.map(escapeCsvField).join(','),
      ...csvData.rows.map(row => {
        const r = results[row._idx]
        const base = csvData.headers.map(h => escapeCsvField(row[h] ?? ''))
        base.push(escapeCsvField(r?.totalKills ?? ''))
        base.push(escapeCsvField(r?.parity ?? ''))
        return base.join(',')
      })
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'polymarket_results_enriched.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived counts ───────────────────────────────────────────────────────

  const pendingCount = csvData?.rows.filter(isPending).length ?? 0
  const doneCount    = Object.values(results).filter(r => r.status === 'done').length
  const errorCount   = Object.values(results).filter(r => r.status === 'error').length
  const loadingCount = Object.values(results).filter(r => r.status === 'loading').length

  const displayRows = (filter === 'pending'
    ? csvData?.rows.filter(isPending)
    : csvData?.rows
  ) ?? []

  const errors = csvData
    ? Object.entries(results)
        .filter(([, r]) => r.status === 'error')
        .map(([idx, r]) => ({ row: csvData.rows[parseInt(idx)], error: r.error }))
    : []

  // ── Render ───────────────────────────────────────────────────────────────

  if (!csvData) {
    return (
      <div
        className="border-2 border-dashed border-gray-600 rounded-xl p-16 text-center cursor-pointer hover:border-blue-500 transition-colors group"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const rdr = new FileReader(); rdr.onload = ev => { const p = parseCSV(ev.target.result); if (p) { setCsvData(p); setResults({}); dateCache.current = {}; stateCache.current = {} } }; rdr.readAsText(f, 'utf-8') } }}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-gray-300 font-semibold">Drop CSV here or click to upload</p>
        <p className="text-gray-600 text-xs mt-2">
          Must contain: <code className="text-gray-500">event_slug</code>, <code className="text-gray-500">event_title</code>, <code className="text-gray-500">title</code>, <code className="text-gray-500">oo_raw_status</code>
        </p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400">{csvData.rows.length} rows</span>
          <span className="text-yellow-400">· {pendingCount} pending</span>
          {doneCount > 0 && <span className="text-green-400">· {doneCount} done</span>}
          {errorCount > 0 && <span className="text-red-400">· {errorCount} errors</span>}
          {loadingCount > 0 && <span className="text-blue-400">· {loadingCount} loading</span>}
          <button
            onClick={() => { setCsvData(null); setResults({}); setCurrentRow(null); dateCache.current = {}; stateCache.current = {} }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
          >
            <option value="all">All rows ({csvData.rows.length})</option>
            <option value="pending">Pending only ({pendingCount})</option>
          </select>
          <button
            onClick={processAll}
            disabled={processing || pendingCount === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            {processing ? <span className="flex items-center gap-2"><MiniSpinner /> Processing...</span> : `Process Pending (${pendingCount})`}
          </button>
          <button
            onClick={downloadCSV}
            disabled={doneCount + errorCount === 0}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
          >
            ↓ Download CSV
          </button>
        </div>
      </div>

      {/* Main area: scrollable table + error console side by side */}
      <div className="flex gap-3 items-start">

        {/* Table with fixed height + sticky header */}
        <div className="flex-1 overflow-auto rounded-xl border border-gray-700 text-xs h-[600px]">
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800 text-gray-400 text-left border-b border-gray-700">
                <th className="px-2 py-2 w-8">#</th>
                <th className="px-2 py-2 whitespace-nowrap">Event Slug</th>
                <th className="px-2 py-2 min-w-[180px]">Match (event_title)</th>
                <th className="px-2 py-2 min-w-[140px]">Question (title)</th>
                <th className="px-2 py-2 whitespace-nowrap">OO Status</th>
                <th className="px-2 py-2 text-center whitespace-nowrap w-16">Kills</th>
                <th className="px-2 py-2 text-center whitespace-nowrap w-20">Odd/Even</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => {
                const result = results[row._idx]
                const pending = isPending(row)
                const isActive = currentRow === row._idx
                return (
                  <tr
                    key={row._idx}
                    ref={el => { rowRefs.current[row._idx] = el }}
                    className={`border-t border-gray-800 transition-colors ${
                      isActive
                        ? 'bg-blue-950 border-l-2 border-l-blue-500'
                        : pending ? 'bg-gray-900' : 'opacity-40'
                    }`}
                  >
                    <td className="px-2 py-2 text-gray-600">{row._idx + 1}</td>
                    <td className="px-2 py-2 text-gray-400 font-mono whitespace-nowrap">{row.event_slug || row.market_slug?.match(/^.+?\d{4}-\d{2}-\d{2}/)?.[0]}</td>
                    <td className="px-2 py-2 text-gray-300">
                      <span title={row.event_title} className="line-clamp-2 leading-tight">
                        {row.event_title}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-blue-300 whitespace-nowrap">{row.title}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <StatusBadge
                        value={row.oo_raw_status}
                        positive="request_open"
                        positiveClass="bg-orange-900 text-orange-300"
                        defaultClass="bg-gray-700 text-gray-500"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {result?.status === 'loading' && <MiniSpinner />}
                      {result?.status === 'done' && (
                        <span className="font-mono text-white font-bold">{result.totalKills}</span>
                      )}
                      {result?.status === 'error' && (
                        <span className="text-red-400 cursor-help" title={result.error}>⚠</span>
                      )}
                      {!result && pending && <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {result?.status === 'done' && (
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          result.parity === 'Even'
                            ? 'bg-purple-900 text-purple-300'
                            : 'bg-orange-900 text-orange-300'
                        }`}>
                          {result.parity}
                        </span>
                      )}
                      {result?.status === 'error' && (
                        <span className="text-red-500 text-xs">✕</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Error console */}
        <div className="w-[280px] shrink-0 h-[600px] bg-gray-950 border border-gray-700 rounded-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Error Console</span>
            <span className="text-[10px] text-red-500 font-mono">{errorCount} errors</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono">
            {errors.length === 0 && (
              <p className="text-gray-700 text-[11px] text-center mt-4">No errors yet</p>
            )}
            {errors.map(({ row, error }) => (
              <div key={row._idx} className="text-[11px] leading-snug border-b border-gray-900 pb-1">
                <span className="text-gray-600">#{row._idx + 1} </span>
                <span className="text-gray-500">{row.event_slug || '—'}</span>
                <br />
                <span className="text-red-400">{error}</span>
              </div>
            ))}
            {/* Sentinel: auto-scroll target */}
            <div ref={consoleEndRef} />
          </div>
        </div>

      </div>
    </div>
  )
}

function StatusBadge({ value, positive, positiveClass, defaultClass }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${value === positive ? positiveClass : defaultClass}`}>
      {value || '—'}
    </span>
  )
}

function MiniSpinner() {
  return (
    <svg className="animate-spin h-3 w-3 inline text-blue-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  )
}
