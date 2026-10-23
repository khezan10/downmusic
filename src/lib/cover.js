/**
 * Per-track artwork.
 *
 * A playlist's embed page exposes one cover: the playlist's own. Every row it
 * lists carries only a track id, so tagging a playlist download with
 * `collection.cover` puts the playlist collage into the MP3 of every song — the
 * bug this module fixes.
 *
 * The per-track cover is available from Spotify's public oEmbed endpoint (no
 * token, CORS open), one small JSON request per track, made at download time
 * rather than for all 50 rows up front.
 */

/** Image id prefixes encode a size tier; the mapping is fixed, not numeric. */
const TIERS = {
  ab67616d00004851: { size: 64, family: 'track' },
  ab67616d00001e02: { size: 300, family: 'track' },
  ab67616d0000b273: { size: 640, family: 'track' },
  ab67706f00000001: { size: 300, family: 'playlist' },
  ab67706f00000002: { size: 60, family: 'playlist' },
  ab67706f00000003: { size: 640, family: 'playlist' },
}

const LARGEST = {
  track: 'ab67616d0000b273',
  playlist: 'ab67706f00000003',
}

/**
 * Ask for the largest size of the same image.
 *
 * oEmbed answers with the 300px tier. The bytes are identical at 640px, the
 * artwork is sharper in a player, and the URL is the only thing that changes.
 */
export function promoteCoverUrl(url) {
  if (!url) return null

  const match = String(url).match(/ab67[0-9a-f]{12}/)
  if (!match) return url

  const token = TIERS[match[0]]
  if (!token) return url

  return String(url).replace(match[0], LARGEST[token.family])
}

/**
 * The cover of one track, from its Spotify link.
 *
 * Never throws: a missing cover costs artwork, not the download.
 *
 * @param {string} spotifyUrl  https://open.spotify.com/track/<id>
 * @returns {Promise<string|null>}
 */
export async function fetchTrackCover(spotifyUrl, { timeoutMs = 6000 } = {}) {
  if (!spotifyUrl || !/\/track\/[A-Za-z0-9]{22}/.test(spotifyUrl)) return null

  try {
    const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'force-cache',
    })
    if (!res.ok) return null

    const data = await res.json()
    return promoteCoverUrl(data?.thumbnail_url) || null
  } catch {
    return null
  }
}
