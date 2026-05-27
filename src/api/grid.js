async function gridPost(endpoint, query, variables = {}) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const ALL_SERIES_QUERY = `
  query AllSeries($gte: String!, $lte: String!, $cursor: String) {
    allSeries(
      first: 50
      after: $cursor
      filter: {
        startTimeScheduled: { gte: $gte, lte: $lte }
        types: ESPORTS
      }
      orderBy: StartTimeScheduled
      orderDirection: ASC
    ) {
      totalCount
      edges {
        node {
          id
          startTimeScheduled
          teams {
            baseInfo {
              id
              name
            }
          }
          tournament {
            id
            name
          }
          title {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`

const SERIES_STATE_QUERY = `
  query SeriesState($id: ID!) {
    seriesState(id: $id) {
      started
      finished
      startedAt
      valid
      format
      teams {
        id
        won
        score
      }
      games {
        sequenceNumber
        started
        finished
        clock {
          currentSeconds
        }
        map {
          name
        }
        teams {
          id
          name
          won
          score
          kills
          deaths
          objectives {
            type
          }
          players {
            name
            kills
            deaths
            killAssistsGiven
            multikills {
              numberOfKills
              count
            }
          }
        }
      }
    }
  }
`

async function fetchAllSeriesInRange(gte, lte) {
  let allEdges = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const data = await gridPost('/api/central-data', ALL_SERIES_QUERY, { gte, lte, cursor })
    const page = data.allSeries
    allEdges = allEdges.concat(page.edges)
    hasNextPage = page.pageInfo.hasNextPage
    cursor = page.pageInfo.endCursor
  }

  return { edges: allEdges }
}

export async function fetchSeriesByDate(date) {
  // Extend to 06:00 next day to catch late-night matches that run past midnight UTC
  const next = new Date(date + 'T00:00:00Z')
  next.setUTCDate(next.getUTCDate() + 1)
  const lte = next.toISOString().slice(0, 10) + 'T06:00:00Z'
  return fetchAllSeriesInRange(`${date}T00:00:00Z`, lte)
}

export async function fetchSeriesByTeamNearDate(teamName, date, dayRadius = 7) {
  const center = new Date(date + 'T12:00:00Z')
  const gte = new Date(center.getTime() - dayRadius * 86400000).toISOString().split('T')[0]
  const lte = new Date(center.getTime() + dayRadius * 86400000).toISOString().split('T')[0]

  const { edges } = await fetchAllSeriesInRange(`${gte}T00:00:00Z`, `${lte}T23:59:59Z`)
  return { edges, gte, lte }
}

export async function fetchSeriesState(seriesId) {
  const data = await gridPost('/api/series-state', SERIES_STATE_QUERY, { id: String(seriesId) })
  return data.seriesState
}
