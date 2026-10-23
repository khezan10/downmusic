/**
 * YouTube Music search over InnerTube (no API key).
 *
 * The response shape moves around: a search can lead with
 * `musicCardShelfRenderer` and continue with `itemSectionRenderer`, and the
 * video id is not on the renderer itself. So the tree is walked and every
 * `musicResponsiveListItemRenderer` is collected, instead of indexing one
 * fixed path.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const ENDPOINT = 'https://music.youtube.com/youtubei/v1/search'

function parseClock(text) {
  const parts = String(text || '')
    .trim()
    .split(':')
    .map((n) => parseInt(n, 10))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function collectRenderers(node, out, depth = 0) {
  if (!node || depth > 12 || out.length > 40) return
  if (Array.isArray(node)) {
    for (const child of node) collectRenderers(child, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  if (node.musicResponsiveListItemRenderer) out.push(node.musicResponsiveListItemRenderer)
  for (const value of Object.values(node)) collectRenderers(value, out, depth + 1)
}

/**
 * Split YouTube Music's subtitle column into structured facts.
 *
 * The column is a bullet list, and the grammar differs per row type:
 *   "Song • Rick Astley"                    a YouTube Music track entity
 *   "Video • Olivia Rodrigo • 1.6M views"   an upload
 *   "Rick Astley • 6.2M views • 9:20"       an upload with its runtime
 *   "Olivia Rodrigo,\u00a0Chappell Roan"     a playlist row
 *
 * The runtime is NOT in fixedColumns — it lives at the end of this string, which
 * is why reading only fixedColumns yields duration 0 for every hit.
 */
export function parseSubtitle(subtitle) {
  const parts = String(subtitle || '')
    .split('•')
    .map((s) => s.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean)

  const KIND_WORDS = /^(song|video|episode|album|artist|playlist|single|podcast)$/i
  const kind = parts.length > 1 && KIND_WORDS.test(parts[0]) ? parts[0].toLowerCase() : null

  let duration = 0
  const rest = []
  for (const part of parts) {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(part)) {
      duration = parseClock(part) || duration
    } else if (!(kind && part === parts[0])) {
      rest.push(part)
    }
  }

  // "1.6M views" / "512K views" is not the artist.
  const artist = rest
    .filter((p) => !/^[\d.]+[KM]?\s+views?$/i.test(p))
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim()

  return { kind, artist, duration }
}

/** Extract the watch id from every place YouTube Music has been seen to put it. */
export function extractVideoId(renderer) {
  const cols = renderer?.flexColumns ?? []
  return (
    cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint
      ?.watchEndpoint?.videoId ??
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId ??
    renderer?.menu?.menuRenderer?.items?.[0]?.menuNavigationItemRenderer?.navigationEndpoint
      ?.watchEndpoint?.videoId ??
    null
  )
}

/** Turn a raw InnerTube payload into a flat hit list. Exported for tests. */
export function parseSearchPayload(data) {
  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents ?? []

  const renderers = []
  collectRenderers(sections, renderers)

  const hits = []
  for (const r of renderers) {
    const cols = r.flexColumns ?? []
    const title =
      cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text?.trim() ?? ''
    const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []
    const subtitle = subRuns
      .map((run) => run?.text ?? '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const { kind, artist, duration } = parseSubtitle(subtitle)
    const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? []
    const thumbnail = thumbs[thumbs.length - 1]?.url ?? ''
    const fixedDuration =
      r?.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ?? ''
    const videoId = extractVideoId(r)

    if (videoId && title) {
      hits.push({
        videoId,
        title,
        artist,
        kind,
        duration: duration || parseClock(fixedDuration),
        thumbnail,
      })
    }
  }
  return hits.slice(0, 12)
}

/** Titles that are a different recording of the same song. */
const OFF_VERSION =
  /\b(cover|karaoke|instrumental|remix|nightcore|slowed|reverb|8d|tribute|mashup|sped\s*up|live|performance|session|tour|glastonbury|concert)\b/i

/**
 * Score hits against the Spotify track.
 *
 * Two signals dominate, and both come from what YouTube Music actually returns:
 *
 *  - `kind === 'song'` marks a YouTube Music *track entity* ("Song • Rick
 *    Astley"), which is the studio audio. Uploads come back as "Video" or as a
 *    bare channel name, and those are where the live/cover versions live.
 *  - `duration` from the subtitle. A 3:33 single against a 9:20 match is a
 *    different recording no matter how well the titles line up — without this,
 *    "Never Gonna Give You Up" resolved to a Glastonbury performance.
 */
export function bestHit(hits, title, artist, expectedDuration = 0) {
  return rankHits(hits, title, artist, expectedDuration)[0] ?? null
}

/** Same scoring as `bestHit`, but the whole ranking — callers try the runner-up. */
export function rankHits(hits, title, artist, expectedDuration = 0) {
  if (!Array.isArray(hits) || hits.length === 0) return []

  const wantedTitle = String(title || '').toLowerCase().trim()
  const wantedArtist = String(artist || '').toLowerCase().trim()
  const firstArtist = wantedArtist.split(',')[0].trim()
  const expected = Number(expectedDuration) || 0

  return hits
    .map((hit, index) => {
      const hitTitle = String(hit.title || '').toLowerCase()
      const hitArtist = String(hit.artist || '').toLowerCase()
      let score = 0

      // A YouTube Music track entity is the studio recording.
      if (hit.kind === 'song') score += 6
      if (hit.kind === 'video') score -= 1

      if (wantedTitle && hitTitle.includes(wantedTitle)) score += 4
      if (wantedTitle && hitTitle === wantedTitle) score += 2
      if (wantedArtist && hitArtist.includes(wantedArtist)) score += 4
      if (firstArtist && hitArtist.includes(firstArtist)) score += 1

      if (expected && hit.duration) {
        const diff = Math.abs(hit.duration - expected)
        if (diff <= 5) score += 5
        else if (diff <= 15) score += 2
        else if (diff <= 40) score += 0
        else if (diff <= 90) score -= 3
        else score -= 6
      }

      if (OFF_VERSION.test(hitTitle) || OFF_VERSION.test(hitArtist)) score -= 4
      if (/\b(19|20)\d{2}\b/.test(hitTitle)) score -= 2
      if (/\b(official (video|music video)|lyric video)\b/.test(hitTitle)) score -= 1
      if (/\b(topic|official audio|audio)\b/.test(hitArtist)) score += 2

      // Mild preference for the earlier, more popular result.
      score += Math.max(0, 1 - index * 0.1)

      return { hit, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit)
}

/** Search YouTube Music. Returns `[]` on any failure — callers fall back. */
export async function searchYouTubeMusic(query, { timeoutMs = 15000 } = {}) {
  if (!query || !String(query).trim()) return []

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query: String(query),
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })

    if (!res.ok) return []
    const data = await res.json()
    return parseSearchPayload(data)
  } catch {
    return []
  }
}

/**
 * Order the candidates the resolver will actually try.
 *
 * Uploads first, "Song" entities last — measured, not guessed: a YouTube Music
 * "Song" entity (an art track) comes back from the converter as **video only**
 * (3 mp4 entries, no m4a/opus), so trying one first is a guaranteed wasted round
 * trip of a second or two. Every non-song upload keeps its score order, and the
 * songs stay at the end as a last resort rather than disappearing.
 */
export function orderCandidates(hits, { limit = 3 } = {}) {
  if (!Array.isArray(hits) || hits.length === 0) return []

  const ordered = []
  const seen = new Set()
  const push = (hit) => {
    if (!hit || seen.has(hit.videoId)) return
    seen.add(hit.videoId)
    ordered.push(hit)
  }

  for (const hit of hits) if (hit.kind !== 'song') push(hit)
  for (const hit of hits) push(hit)

  return ordered.slice(0, limit)
}

/**
 * Search regular YouTube (InnerTube WEB client).
 *
 * YouTube Music's search ranks songs and performances, and the official studio
 * upload often is not in it at all — for "Never Gonna Give You Up" the 3:33
 * official video is absent while a 9:20 live take and a 3:54 TV performance are
 * present. The regular search does return it, so the two are merged.
 */
export async function searchYouTubeWeb(query, { timeoutMs = 15000 } = {}) {
  if (!query || !String(query).trim()) return []

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://www.youtube.com',
        Referer: 'https://www.youtube.com/',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query: String(query),
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) return []

    const data = await res.json()
    const renderers = []
    const walk = (node, depth = 0) => {
      if (!node || depth > 14 || renderers.length > 40) return
      if (Array.isArray(node)) {
        for (const child of node) walk(child, depth + 1)
        return
      }
      if (typeof node !== 'object') return
      if (node.videoRenderer) renderers.push(node.videoRenderer)
      for (const value of Object.values(node)) walk(value, depth + 1)
    }
    walk(data?.contents, 0)

    return renderers
      .map((r) => {
        const title = r?.title?.runs?.map((x) => x.text).join('') ?? ''
        const channel = r?.ownerText?.runs?.[0]?.text ?? ''
        const length = r?.lengthText?.simpleText ?? ''
        return {
          videoId: r?.videoId,
          title: title.trim(),
          artist: channel.trim(),
          kind: null,
          duration: parseClock(length),
          thumbnail:
            r?.thumbnail?.thumbnails?.[r.thumbnail.thumbnails.length - 1]?.url ?? '',
        }
      })
      .filter((h) => h.videoId && h.title)
      .slice(0, 12)
  } catch {
    return []
  }
}

/** Title + artist -> best YouTube Music match, or null. */
export async function findYouTubeMatch(title, artist, { duration = 0, ...options } = {}) {
  const [hit] = await findYouTubeMatches(title, artist, { duration, ...options })
  return hit ?? null
}

/**
 * Ranked candidates, best first.
 *
 * More than one is returned on purpose: the converter occasionally answers with
 * no audio stream for a perfectly valid video, and a "Song" entity never has one.
 */
export async function findYouTubeMatches(
  title,
  artist,
  { duration = 0, limit = 3, timeoutMs } = {}
) {
  const query = [artist, title].filter(Boolean).join(' ').trim()
  if (!query) return []

  // Both catalogues, merged: YouTube Music ranks songs and performances, the
  // regular search still has the official upload.
  const [musicHits, webHits] = await Promise.all([
    searchYouTubeMusic(query, { timeoutMs }),
    searchYouTubeWeb(query, { timeoutMs }),
  ])

  const seen = new Set()
  const merged = []
  for (const hit of [...musicHits, ...webHits]) {
    if (!hit?.videoId || seen.has(hit.videoId)) continue
    seen.add(hit.videoId)
    merged.push(hit)
  }

  return orderCandidates(rankHits(merged, title, artist, duration), { limit }).map((hit) => ({
    ...hit,
    watchUrl: `https://www.youtube.com/watch?v=${hit.videoId}`,
    musicUrl: `https://music.youtube.com/watch?v=${hit.videoId}`,
  }))
}
