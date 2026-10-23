/**
 * Spotify metadata without an API key.
 *
 * `open.spotify.com/embed/<type>/<id>` renders a Next.js page that carries the
 * whole entity in `__NEXT_DATA__`:
 *
 *   track  -> name, artists[], duration, audioPreview, visualIdentity.image
 *   album  -> name, subtitle (artist), visualIdentity.image, trackList[]
 *   playlist -> name, subtitle (owner), visualIdentity.image, trackList[]
 *
 * That is strictly better than `open.spotify.com/oembed` (title only) and it
 * needs no Deezer/iTunes round trip for the artist. Verified 2026-10-24.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const SPOTIFY_TYPES = ['track', 'album', 'playlist']

/**
 * Accept every form a person can paste:
 *   https://open.spotify.com/track/<id>?si=...
 *   https://open.spotify.com/intl-id/track/<id>
 *   https://open.spotify.com/embed/track/<id>
 *   spotify:track:<id>
 */
export function parseSpotifyUrl(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null

  const uri = raw.match(/^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/)
  if (uri) return { type: uri[1], id: uri[2] }

  let url
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'open.spotify.com' && host !== 'play.spotify.com') return null

  const m = url.pathname.match(/\/(?:embed\/)?(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})/)
  if (!m) return null
  return { type: m[1], id: m[2] }
}

export function spotifyUri({ type, id }) {
  return `spotify:${type}:${id}`
}

export function spotifyUrl({ type, id }) {
  return `https://open.spotify.com/${type}/${id}`
}

/**
 * Spotify image ids encode a size tier in the first 16 hex chars, and the
 * mapping is fixed, not numeric:
 *   ab67616d00004851 -> 64     ab67616d00001e02 -> 300    ab67616d0000b273 -> 640
 *   ab67706f00000001 -> 300    ab67706f00000002 -> 60     ab67706f00000003 -> 640
 * Anything unrecognised falls back to the last entry, which is the largest in
 * every payload observed so far.
 */
const IMAGE_TIERS = {
  ab67616d00004851: 64,
  ab67616d00001e02: 300,
  ab67616d0000b273: 640,
  ab67706f00000001: 300,
  ab67706f00000002: 60,
  ab67706f00000003: 640,
}

/** The largest image in a Spotify visualIdentity block. */
function pickCover(entity) {
  const images = entity?.visualIdentity?.image ?? []
  const urls = images.map((i) => i?.url).filter(Boolean)
  if (urls.length === 0) return null

  const tier = (url) => {
    const match = String(url).match(/image\/([0-9a-f]{16})/i)
    return match ? (IMAGE_TIERS[match[1].toLowerCase()] ?? 0) : 0
  }

  const best = urls.reduce((a, b) => (tier(b) > tier(a) ? b : a), urls[0])
  return tier(best) > 0 ? best : urls[urls.length - 1]
}

function normalizeTrack(raw, index) {
  const uri = raw?.uri ?? ''
  const id = uri.split(':')[2] ?? null
  return {
    index: index + 1,
    id,
    uri: uri || null,
    title: raw?.title ?? raw?.name ?? 'Unknown track',
    artist: (raw?.subtitle ?? '').replace(/\u00a0/g, ' ').trim() || 'Unknown artist',
    duration: raw?.duration ? Math.round(raw.duration / 1000) : null,
    isPlayable: raw?.isPlayable !== false,
    spotifyUrl: id ? `https://open.spotify.com/track/${id}` : null,
  }
}

/**
 * Normalize the embed entity into the shape the API returns.
 * `kind` is 'track' for a single track, otherwise the collection type.
 */
export function normalizeEntity(entity, { type, id } = {}) {
  if (!entity || typeof entity !== 'object') return null

  const kind = entity.type || type || 'track'
  const cover = pickCover(entity)

  if (kind === 'track') {
    const artists = Array.isArray(entity.artists)
      ? entity.artists.map((a) => a?.name).filter(Boolean).join(', ')
      : ''
    const trackId = entity.id ?? id ?? null
    return {
      kind: 'track',
      id: trackId,
      name: entity.name ?? entity.title ?? 'Unknown track',
      artist: artists || entity.subtitle || 'Unknown artist',
      album: null,
      cover,
      duration: entity.duration ? Math.round(entity.duration / 1000) : null,
      releaseDate: entity.releaseDate?.isoString?.slice(0, 10) ?? null,
      spotifyUrl: trackId ? `https://open.spotify.com/track/${trackId}` : null,
      tracks: [],
      total: 1,
    }
  }

  const trackList = Array.isArray(entity.trackList) ? entity.trackList : []
  return {
    kind,
    id: entity.id ?? id ?? null,
    name: entity.name ?? entity.title ?? 'Unknown collection',
    artist: (entity.subtitle ?? '').replace(/\u00a0/g, ' ').trim() || 'Spotify',
    album: kind === 'album' ? entity.name ?? null : null,
    cover,
    duration: null,
    preview: null,
    releaseDate: entity.releaseDate?.isoString?.slice(0, 10) ?? null,
    tracks: trackList.map(normalizeTrack),
    total: trackList.length,
  }
}

/** Fetch + parse the embed page. Returns `{ entity, error }`. */
export async function fetchSpotifyEntity({ type, id }, { timeoutMs = 15000 } = {}) {
  if (!SPOTIFY_TYPES.includes(type) || !/^[A-Za-z0-9]{22}$/.test(String(id))) {
    return { entity: null, error: 'Not a valid Spotify link.' }
  }

  const endpoint = `https://open.spotify.com/embed/${type}/${id}`
  let html
  try {
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!res.ok) return { entity: null, error: `Spotify embed answered HTTP ${res.status}.` }
    html = await res.text()
  } catch (e) {
    return { entity: null, error: `Spotify embed request failed (${e.message}).` }
  }

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/
  )
  if (!match) return { entity: null, error: 'Spotify embed page carried no entity data.' }

  let data
  try {
    data = JSON.parse(match[1])
  } catch {
    return { entity: null, error: 'Spotify embed data was not valid JSON.' }
  }

  const entity = data?.props?.pageProps?.state?.data?.entity
  if (!entity) {
    return {
      entity: null,
      error: 'Spotify returned no data for this link — it may be private, deleted or region-locked.',
    }
  }

  return { entity, error: null }
}

/** Convenience: parse a URL and return the normalized entity in one call. */
export async function resolveSpotifyLink(input, options) {
  const parsed = parseSpotifyUrl(input)
  if (!parsed) {
    return { data: null, error: 'That is not a Spotify track, album or playlist link.' }
  }
  const { entity, error } = await fetchSpotifyEntity(parsed, options)
  if (!entity) return { data: null, error }
  return { data: normalizeEntity(entity, parsed), error: null, parsed }
}
