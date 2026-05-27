const parity = (n) => (n % 2 === 0 ? 'Even' : 'Odd')

// Polymarket: daytime 0–5 min, nighttime 5–10 min, daytime 10–15 min, ...
// Uses in-game Dota 2 clock seconds (not wall-clock duration)
function endsInDaytime(currentSeconds) {
  if (currentSeconds == null) return null
  return Math.floor(currentSeconds / 300) % 2 === 0
}

function formatClock(currentSeconds) {
  if (currentSeconds == null) return null
  const m = Math.floor(currentSeconds / 60)
  const s = String(currentSeconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

// Match by team ID first (teams may be in different order across the two APIs),
// then fall back to index if no ID match is found
function mergeTeamNames(stateTeams, seriesTeams) {
  if (!stateTeams) return []
  return stateTeams.map((t, i) => {
    const byId = seriesTeams?.find(st => String(st.baseInfo?.id) === String(t.id))
    const byIndex = seriesTeams?.[i]
    return {
      ...t,
      name: byId?.baseInfo?.name || byIndex?.baseInfo?.name || t.name || `Team ${i + 1}`
    }
  })
}

export default function SeriesResult({ series, state }) {
  if (!state) return null

  const isDota2 = String(series?.title?.id) === '2' ||
    series?.title?.name?.toLowerCase().includes('dota')

  const teams = mergeTeamNames(state.teams, series?.teams)
  const team1 = teams[0]
  const team2 = teams[1]
  const winner = teams.find(t => t.won)
  const gamesTotal = state.games?.filter(g => g.finished).length ?? 0

  const matchDate = series?.startTimeScheduled
    ? new Date(series.startTimeScheduled).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
      })
    : null

  return (
    <div className="mt-6 space-y-3">
      {/* Series header */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">{series.tournament?.name}</p>
            {matchDate && <p className="text-xs text-gray-500 mt-0.5">{matchDate}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
            state.finished ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
          }`}>
            {state.finished ? 'Finished' : 'Live'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className={`text-lg font-bold ${team1?.won ? 'text-white' : 'text-gray-400'}`}>{team1?.name || '—'}</p>
          </div>
          <div className="text-center mx-4">
            <p className="text-3xl font-black text-white font-mono">
              {team1?.score ?? '?'} <span className="text-gray-500">–</span> {team2?.score ?? '?'}
            </p>
            {winner && (
              <p className="text-xs text-yellow-400 mt-1">Winner: {winner.name}</p>
            )}
          </div>
          <div className="flex-1 text-right">
            <p className={`text-lg font-bold ${team2?.won ? 'text-white' : 'text-gray-400'}`}>{team2?.name || '—'}</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-700">
          <span className="text-sm text-gray-300">
            Games Total: <span className="font-bold text-white">{gamesTotal}</span>
            <span className="ml-2 text-gray-500 text-xs">({state.format || '—'})</span>
          </span>
        </div>
      </div>

      {/* Per-game breakdown */}
      {state.games?.filter(g => g.finished).map(game => (
        <MapCard key={game.sequenceNumber} game={game} mapIndex={game.sequenceNumber} isDota2={isDota2} />
      ))}
    </div>
  )
}

function MapCard({ game, mapIndex, isDota2 }) {
  const t1 = game.teams?.[0]
  const t2 = game.teams?.[1]
  const winner = game.teams?.find(t => t.won)
  const totalRounds = (t1?.score ?? 0) + (t2?.score ?? 0)
  const totalKills = (t1?.kills ?? 0) + (t2?.kills ?? 0)

  // Dota 2 Polymarket market computations
  const clockSecs = game.clock?.currentSeconds ?? null
  const daylight = isDota2 ? endsInDaytime(clockSecs) : null

  const allPlayers = isDota2 ? [...(t1?.players || []), ...(t2?.players || [])] : []
  const multikillDataAvailable = allPlayers.some(p => Array.isArray(p.multikills))
  const anyUltraKill = multikillDataAvailable
    ? allPlayers.some(p => p.multikills?.some(mk => mk.numberOfKills >= 4 && mk.count > 0))
    : null
  const anyRampage = multikillDataAvailable
    ? allPlayers.some(p => p.multikills?.some(mk => mk.numberOfKills >= 5 && mk.count > 0))
    : null

  const hasObjectives = Array.isArray(t1?.objectives) && Array.isArray(t2?.objectives)
  const t1DestroyedBarracks = hasObjectives
    ? t1.objectives.some(o => /barracks/i.test(o.type))
    : null
  const t2DestroyedBarracks = hasObjectives
    ? t2.objectives.some(o => /barracks/i.test(o.type))
    : null
  const bothDestroyBarracks = hasObjectives
    ? (t1DestroyedBarracks && t2DestroyedBarracks)
    : null

  const t1BeatRoshan = hasObjectives
    ? t1.objectives.some(o => /roshan/i.test(o.type))
    : null
  const t2BeatRoshan = hasObjectives
    ? t2.objectives.some(o => /roshan/i.test(o.type))
    : null
  const bothBeatRoshan = hasObjectives
    ? (t1BeatRoshan && t2BeatRoshan)
    : null

  const durationLabel = isDota2 ? formatClock(clockSecs) : null

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono">{isDota2 ? 'GAME' : 'MAP'} {mapIndex}</span>
          {!isDota2 && (
            <span className="text-sm font-bold text-blue-300 uppercase tracking-wide">
              {game.map?.name || 'Unknown'}
            </span>
          )}
          {isDota2 && durationLabel && (
            <span className="text-xs text-gray-500">{durationLabel}</span>
          )}
        </div>
        {winner && (
          <span className="text-xs text-yellow-400 font-medium">Winner: {winner.name}</span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Score row */}
        <div className="flex items-center justify-between text-sm">
          <span className={t1?.won ? 'text-white font-semibold' : 'text-gray-400'}>{t1?.name}</span>
          <span className="font-mono text-gray-300 text-base font-bold">
            {t1?.score ?? '?'} – {t2?.score ?? '?'}
          </span>
          <span className={t2?.won ? 'text-white font-semibold text-right' : 'text-gray-400 text-right'}>{t2?.name}</span>
        </div>

        {/* Stats */}
        <div className="space-y-2">
          {!isDota2 && (
            <StatLine
              label="Total Rounds"
              value={totalRounds}
              tag={parity(totalRounds)}
              tagColor={parity(totalRounds) === 'Even' ? 'text-purple-400' : 'text-orange-400'}
            />
          )}
          <StatLine
            label="Total Kills"
            value={totalKills}
            tag={parity(totalKills)}
            tagColor={parity(totalKills) === 'Even' ? 'text-purple-400' : 'text-orange-400'}
          />
        </div>

        {/* Dota 2 Polymarket markets */}
        {isDota2 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 uppercase tracking-widest pt-1 pb-0.5">Polymarket Markets</p>
            <Dota2Market label="Ends in Daytime?" value={daylight} />
            <Dota2Market label="Any Player Ultra Kill?" value={anyUltraKill} />
            <Dota2Market label="Any Player Rampage?" value={anyRampage} />
            <Dota2Market label="Both Teams Destroy Barracks?" value={bothDestroyBarracks} />
            <Dota2Market label="Both Teams Beat Roshan?" value={bothBeatRoshan} />
          </div>
        )}

        {/* Players */}
        {(t1?.players?.length > 0 || t2?.players?.length > 0) && (
          <div className="space-y-1.5 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <PlayersTable players={t1?.players} teamName={t1?.name} isDota2={isDota2} />
              <PlayersTable players={t2?.players} teamName={t2?.name} isDota2={isDota2} />
            </div>
            {isDota2 && (
              <div className="flex items-center gap-4 px-1 pt-0.5">
                <span className="text-[10px] text-gray-500">
                  <span className="text-orange-400 font-bold">■</span> Ultra Kill
                </span>
                <span className="text-[10px] text-gray-500">
                  <span className="text-yellow-300 font-bold">■</span> Rampage
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Dota2Market({ label, value }) {
  const isNull = value === null || value === undefined
  return (
    <div className="flex items-center justify-between bg-gray-750 rounded-lg px-3 py-2 border border-gray-700">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
        isNull ? 'text-gray-500 bg-gray-800' :
        value ? 'text-green-400 bg-green-950' : 'text-red-400 bg-red-950'
      }`}>
        {isNull ? 'N/A' : value ? 'Yes' : 'No'}
      </span>
    </div>
  )
}

function StatLine({ label, value, tag, tagColor }) {
  return (
    <div className="flex items-center justify-between bg-gray-750 rounded-lg px-3 py-2 border border-gray-700">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-white font-mono">{value}</span>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-700 ${tagColor}`}>{tag}</span>
      </div>
    </div>
  )
}

function PlayersTable({ players, teamName, isDota2 }) {
  if (!players?.length) return null
  const sorted = [...players].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-gray-700">
        <p className="text-xs font-semibold text-gray-300 truncate">{teamName}</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="px-2 py-1 text-left">Player</th>
            <th className="px-1 py-1 text-right">K</th>
            <th className="px-1 py-1 text-right">D</th>
            <th className="px-1 py-1 text-right">A</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const hasRampage = isDota2 && p.multikills?.some(mk => mk.numberOfKills >= 5 && mk.count > 0)
            const hasUltraKill = isDota2 && !hasRampage && p.multikills?.some(mk => mk.numberOfKills >= 4 && mk.count > 0)
            const nameColor = hasRampage ? 'text-yellow-300 font-semibold' :
                              hasUltraKill ? 'text-orange-400 font-semibold' :
                              'text-gray-300'
            return (
              <tr key={i} className="border-t border-gray-800">
                <td className={`px-2 py-1 truncate max-w-[90px] ${nameColor}`}>{p.name || `#${i + 1}`}</td>
                <td className="px-1 py-1 text-right text-green-400 font-mono">{p.kills ?? '—'}</td>
                <td className="px-1 py-1 text-right text-red-400 font-mono">{p.deaths ?? '—'}</td>
                <td className="px-1 py-1 text-right text-blue-400 font-mono">{p.killAssistsGiven ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
