# UMA Esports Verifier

A tool for the UMA Protocol team to verify CS2 and Dota 2 match results using the [GRID.gg](https://grid.gg) Open Access API. Paste a Polymarket slug and get back full match stats to resolve prediction market proposals.

---

## What it does

- Paste a Polymarket slug (e.g. `cs2-navi-faze-2026-04-02`) and the app finds the match on GRID.gg
- Displays series score, winner, per-map/game breakdown, and player stats (K/D/A)
- **CS2**: Total Rounds (Odd/Even), Total Kills (Odd/Even) per map
- **Dota 2**: Polymarket market results per game — Ends in Daytime, Any Player Ultra Kill, Any Player Rampage, Both Teams Destroy Barracks, Both Teams Beat Roshan
- If the automatic match fails, shows a list of candidates to pick from manually

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A GRID.gg Open Access API key

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/uma-esports-verifier.git
cd uma-esports-verifier
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create a `.env` file in the project root:

```
GRID_API_KEY=your_api_key_here
PORT=3001
```

> **Note:** The `.env` file is in `.gitignore` and is never committed. Ask a teammate for the API key.

---

## Running locally

```bash
npm run dev
```

This starts both the Express backend (port 3001) and the Vite dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deploying to Railway

The app is already configured for Railway deployment (`railway.json` and `Procfile` are included).

1. Push this repo to GitHub
2. In Railway, create a new project → **Deploy from GitHub repo**
3. Add the environment variable `GRID_API_KEY` in Railway's Variables tab
4. Railway will automatically run `npm install && npm run build` and then `npm start`

The production build serves the React frontend statically through the Express server on a single port.

---

## How to use

1. Go to [Polymarket](https://polymarket.com) and find the esports market you want to verify
2. Copy the slug from the URL (e.g. `cs2-navi-faze-2026-04-02`)
3. Paste it into the search box and click **Search**
4. If the match is found automatically, results are displayed immediately
5. If not (partial match or ambiguous), a list of candidates appears — click the correct one

### Slug format

```
{game}-{team1_abbrev}-{team2_abbrev}-{YYYY-MM-DD}
```

Examples:
- `cs2-navi-faz-2026-04-02`
- `dota2-liquid-sprit-2026-05-26`

---

## Project structure

```
├── server/
│   └── index.js          # Express server — proxies GRID API calls (keeps API key server-side)
├── src/
│   ├── App.jsx            # Main app logic and search flow
│   ├── api/
│   │   └── grid.js        # GraphQL queries to GRID.gg
│   ├── components/
│   │   ├── SeriesResult.jsx   # Match result display (CS2 + Dota 2)
│   │   └── SeriesPicker.jsx   # Manual match selection UI
│   └── utils/
│       └── matching.js    # Fuzzy team name matching logic
├── .env                   # (not committed) API key and port
├── railway.json           # Railway deployment config
└── Procfile               # Process definition for Railway
```

---

## Notes

- GRID Open Access does **not** cover all tournaments. Some smaller leagues (e.g. BC Game Masters, Exort Series) may return no results.
- If a match isn't found on the exact date, use the **"Search ±7 days"** button that appears on partial matches.
- Dota 2 title ID on GRID is `2`; CS2 is `28`. The app detects the game type automatically from the series data.
