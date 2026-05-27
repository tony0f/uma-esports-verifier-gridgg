import { useState } from 'react'
import { fetchSeriesByDate, fetchSeriesByTeamNearDate, fetchSeriesState } from './api/grid.js'
import { parsePolymarketSlug, findBestMatch, matchScore } from './utils/matching.js'
import SeriesResult from './components/SeriesResult.jsx'
import SeriesPicker from './components/SeriesPicker.jsx'

const MATCH_THRESHOLD = 60
const TEAM_MATCH_THRESHOLD = 60

export default function App() {
  const [input, setInput] = useState('')
  const [team1Input, setTeam1Input] = useState('')
  const [team2Input, setTeam2Input] = useState('')
  const [status, setStatus] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [candidates, setCandidates] = useState([])
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [seriesState, setSeriesState] = useState(null)
  const [foundTeam, setFoundTeam] = useState(null)
  const [loadingMsg, setLoadingMsg] = useState('Querying GRID.gg...')

  async function loadSeriesState(series) {
    setSelectedSeries(series)
    setCandidates([])
    setFoundTeam(null)
    setErrorMsg('')
    setStatus('loading')
    setLoadingMsg('Loading series data...')
    try {
      const state = await fetchSeriesState(series.id)
      setSeriesState(state)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  async function handleTeamSearch() {
    if (!foundTeam) return
    setStatus('loading')
    setLoadingMsg(`Searching matches for "${foundTeam.teamName}" (±7 days around ${foundTeam.date})...`)
    setErrorMsg('')
    setCandidates([])
    setSeriesState(null)
    setSelectedSeries(null)

    try {
      const { edges, gte, lte } = await fetchSeriesByTeamNearDate(foundTeam.teamName, foundTeam.date)
      const seriesList = edges.map(e => e.node)

      const matched = seriesList
        .filter(series => {
          const teams = series.teams?.map(t => t.baseInfo?.name || '') || []
          return teams.some(name => matchScore(foundTeam.teamName, name) >= TEAM_MATCH_THRESHOLD)
        })
        .map(series => ({ series, score: 0 }))

      if (!matched.length) {
        setErrorMsg(`No matches found for "${foundTeam.teamName}" between ${gte.split('T')[0]} and ${lte.split('T')[0]}.`)
        setStatus('error')
        return
      }

      setCandidates(matched)
      setErrorMsg(`Showing ${matched.length} match(es) for "${foundTeam.teamName}" near ${foundTeam.date}. Select the correct one.`)
      setStatus('done')
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    const raw = input.trim()
    if (!raw) return

    setStatus('loading')
    setLoadingMsg('Querying GRID.gg...')
    setErrorMsg('')
    setCandidates([])
    setSelectedSeries(null)
    setSeriesState(null)
    setFoundTeam(null)

    const parsed = parsePolymarketSlug(raw)
    if (!parsed) {
      setErrorMsg('Unrecognized format. Use a Polymarket slug (e.g. cs2-aab-inf6-2026-04-02).')
      setStatus('error')
      return
    }

    // If full team names are provided, use them — much more reliable than slug abbreviations
    const hint1 = team1Input.trim() || parsed.hint1
    const hint2 = team2Input.trim() || parsed.hint2

    try {
      const result = await fetchSeriesByDate(parsed.date)
      const seriesList = result.edges.map(e => e.node)

      if (!seriesList.length) {
        setErrorMsg(`No series found for ${parsed.date}.`)
        setStatus('error')
        return
      }

      const best = findBestMatch(hint1, hint2, seriesList)

      if (best && best.score >= MATCH_THRESHOLD && best.bothMatched) {
        await loadSeriesState(best.series)
      } else {
        const all = seriesList.map(series => {
          const m = findBestMatch(hint1, hint2, [series])
          return { series, score: m?.score ?? 0 }
        }).sort((a, b) => b.score - a.score)

        if (best && !best.bothMatched) {
          const matchedTeamName = best.hint1Matched ? best.hint1TeamName : best.hint2TeamName
          const matchedHint = best.hint1Matched ? hint1 : hint2
          const missedHint = best.hint1Matched ? hint2 : hint1
          setErrorMsg(`Partial match: "${matchedHint}" → ${matchedTeamName} (found), but "${missedHint}" had no match for ${parsed.date}.`)
          setFoundTeam({ teamName: matchedTeamName, date: parsed.date })
        }

        setCandidates(all.slice(0, 10))
        setStatus('done')
      }
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-8 bg-blue-500 rounded-full" />
            <h1 className="text-2xl font-black tracking-tight">UMA Esports Verifier</h1>
          </div>
          <p className="text-gray-400 text-sm pl-5">
            Verify CS2 / Dota 2 match results using GRID.gg
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Polymarket Slug</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="cs2-aab-inf6-2026-04-02"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm font-mono"
                disabled={status === 'loading'}
              />
              <button
                type="submit"
                disabled={status === 'loading' || !input.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-semibold transition-colors"
              >
                {status === 'loading' ? 'Searching...' : 'Search'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Copy the slug directly from the Polymarket URL</p>
          </div>

          {/* Optional team name fields */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Team names <span className="text-gray-600">(optional — greatly improves matching accuracy)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={team1Input}
                onChange={e => setTeam1Input(e.target.value)}
                placeholder="e.g. AaB Esport"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                disabled={status === 'loading'}
              />
              <input
                type="text"
                value={team2Input}
                onChange={e => setTeam2Input(e.target.value)}
                placeholder="e.g. Infinite"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm"
                disabled={status === 'loading'}
              />
            </div>
          </div>
        </form>

        {/* Loading */}
        {status === 'loading' && (
          <div className="mt-8 flex items-center gap-3 text-gray-400">
            <Spinner />
            <span className="text-sm">{loadingMsg}</span>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="mt-6 bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Partial match warning + team search */}
        {status === 'done' && errorMsg && (
          <div className="mt-4 bg-yellow-950 border border-yellow-700 rounded-lg px-4 py-3 space-y-2">
            <p className="text-yellow-300 text-sm">{errorMsg}</p>
            {foundTeam && (
              <button
                onClick={handleTeamSearch}
                className="text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
              >
                Search all matches for "{foundTeam.teamName}" ±7 days
              </button>
            )}
          </div>
        )}

        {/* Picker */}
        {status === 'done' && candidates.length > 0 && (
          <SeriesPicker candidates={candidates} onSelect={loadSeriesState} />
        )}

        {/* Result */}
        {status === 'done' && seriesState && selectedSeries && (
          <SeriesResult series={selectedSeries} state={seriesState} />
        )}

      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  )
}
