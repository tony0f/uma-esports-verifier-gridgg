// Shown when the auto-match confidence is low — lets the user pick manually
export default function SeriesPicker({ candidates, onSelect }) {
  if (!candidates?.length) return null

  return (
    <div className="mt-4">
      <p className="text-sm text-yellow-400 mb-2">
        No exact match found. Select the correct series:
      </p>
      <div className="space-y-2">
        {candidates.map(({ series, score }) => {
          const teams = series.teams?.map(t => t.baseInfo?.name).join(' vs ') || '—'
          const date = series.startTimeScheduled
            ? new Date(series.startTimeScheduled).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })
            : '—'
          return (
            <button
              key={series.id}
              onClick={() => onSelect(series)}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-blue-500 rounded-lg px-4 py-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-medium text-sm">{teams}</span>
                <span className="text-xs text-gray-400 ml-2 shrink-0"></span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {series.tournament?.name} · {date} UTC · match score: {score}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
