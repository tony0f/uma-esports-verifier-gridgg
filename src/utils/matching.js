const DIGIT_WORDS = { '0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine' }

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// "g1" → "gone", "inf6" → "infsix"
function expandDigits(str) {
  return str.replace(/\d/g, d => DIGIT_WORDS[d])
}

// First letter of each space-separated word: "METANOIA WOLVES" → "mw"
function wordInitials(str) {
  return str.trim().split(/[\s_]+/).filter(Boolean).map(w => w[0].toLowerCase()).join('')
}

// First letter of each CamelCase segment: "DashSkins" → "ds"
function camelInitials(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_]+/).filter(Boolean)
    .map(w => w[0].toLowerCase())
    .join('')
}

export function matchScore(hint, teamName) {
  const nh = normalize(hint)
  const nt = normalize(teamName)

  if (nh === nt) return 100

  // Substring containment
  if (nh.length >= 2 && nt.includes(nh)) return 80
  if (nt.length >= 2 && nh.includes(nt)) return 75

  // Initialism match: "mw" → "METANOIA WOLVES", "ds" → "DashSkins"
  if (nh === wordInitials(teamName)) return 85
  if (nh === camelInitials(teamName)) return 85

  // Split hint into letter prefix + digit word: "g1" → "g" prefix of name AND "one" in name
  // Handles: "g1" → "GenOne", "ray5" → "Ray5ive", etc.
  const letterPrefix = nh.replace(/\d.*$/, '')       // "g" from "g1"
  const trailingDigits = nh.replace(/^[a-z]+/, '')   // "1" from "g1"
  if (letterPrefix && trailingDigits) {
    const digitWord = expandDigits(trailingDigits)    // "one" from "1"
    if (nt.startsWith(letterPrefix) && nt.includes(digitWord)) return 78
  }

  // Hint without trailing digits as prefix: "inf6" → "inf" matches "infinite"
  const hintNoDigits = nh.replace(/\d+$/, '')
  if (hintNoDigits.length >= 3 && nt.startsWith(hintNoDigits)) return 65

  // Prefix match
  if (nh.length >= 3 && nt.startsWith(nh)) return 60
  if (nt.length >= 3 && nh.startsWith(nt)) return 50

  return 0
}

export function findBestMatch(hint1, hint2, seriesList) {
  let best = null
  let bestScore = 0

  for (const series of seriesList) {
    const teams = series.teams?.map(t => t.baseInfo?.name || '') || []
    if (teams.length < 2) continue

    const sA1 = matchScore(hint1, teams[0]), sA2 = matchScore(hint2, teams[1])
    const sB1 = matchScore(hint1, teams[1]), sB2 = matchScore(hint2, teams[0])
    const scoreA = sA1 + sA2
    const scoreB = sB1 + sB2

    let score, s1, s2, name1, name2
    if (scoreA >= scoreB) {
      score = scoreA; s1 = sA1; s2 = sA2; name1 = teams[0]; name2 = teams[1]
    } else {
      score = scoreB; s1 = sB1; s2 = sB2; name1 = teams[1]; name2 = teams[0]
    }

    if (score > bestScore) {
      bestScore = score
      best = {
        series,
        score,
        bothMatched: s1 > 0 && s2 > 0,
        hint1Matched: s1 > 0,
        hint2Matched: s2 > 0,
        hint1TeamName: s1 > 0 ? name1 : null,
        hint2TeamName: s2 > 0 ? name2 : null,
      }
    }
  }

  return best
}

// Parse a Polymarket slug like "cs2-aab-inf6-2026-04-02"
export function parsePolymarketSlug(slug) {
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})$/)
  if (!dateMatch) return null

  const date = dateMatch[1]
  const withoutDate = slug.slice(0, slug.length - date.length - 1)
  const parts = withoutDate.split('-')
  if (parts.length < 3) return null

  const game = parts[0]
  const hints = parts.slice(1)
  const mid = Math.ceil(hints.length / 2)
  const hint1 = hints.slice(0, mid).join('-')
  const hint2 = hints.slice(mid).join('-')

  return { game, date, hint1, hint2 }
}
