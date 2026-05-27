import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3001
const GRID_API_KEY = process.env.GRID_API_KEY

const CENTRAL_DATA_URL = 'https://api-op.grid.gg/central-data/graphql'
const SERIES_STATE_URL = 'https://api-op.grid.gg/live-data-feed/series-state/graphql'

async function gridQuery(url, query, variables = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GRID_API_KEY
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GRID API error ${response.status}: ${text}`)
  }

  return response.json()
}

// Proxy: Central Data (allSeries)
app.post('/api/central-data', async (req, res) => {
  try {
    const { query, variables } = req.body
    const data = await gridQuery(CENTRAL_DATA_URL, query, variables)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Proxy: Series State
app.post('/api/series-state', async (req, res) => {
  try {
    const { query, variables } = req.body
    const data = await gridQuery(SERIES_STATE_URL, query, variables)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve React build in production
const distPath = join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  try {
    res.sendFile(join(distPath, 'index.html'))
  } catch {
    res.status(404).send('Build not found. Run: npm run build')
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
