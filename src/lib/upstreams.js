/**
 * The upstream registry.
 *
 * One list, imported by the probe route, the health route, the resolve path and
 * the UI. A monitor built from a second, hand-written list drifts from reality
 * within a week.
 *
 * The list is the *whole* chain, in the order a download walks it:
 *
 *   open.spotify.com      metadata + track list   (no token)
 *   YouTube search        recording match         (Music + Web catalogues)
 *   SaveFrom converter    audio stream            (m4a)
 *   Cloudflare Worker     media transfer          (CORS + Range)
 *
 * Rules learned the hard way:
 *  - a probe must use a target the upstream actually supports (SaveFrom: a
 *    YouTube watch URL; Spotify embed: a track page), or it reports a false down
 *  - a probe must send the same headers as production, or it reports a false up
 *  - "role" (static), "status" (probed) and "serves" (does it hand over file
 *    bytes) are three different facts and are never mixed
 *  - nothing local belongs here: no localhost, no 127.0.0.1, no LAN address, no
 *    service running on the developer's machine. Production cannot reach them,
 *    and a monitor that reports them is lying. Everything below is a public
 *    host reachable from Vercel.
 */

import { pickAudio, resolveViaSaveFrom } from './savefrom.js'
import { searchYouTubeMusic, searchYouTubeWeb } from './youtube.js'
import { fetchSpotifyEntity } from './spotify.js'

/** A stable, public, short video used only to exercise the converter. */
const PROBE_VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const PROBE_TRACK = { type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' }
const PROBE_QUERY = 'never gonna give you up rick astley'

/** The Worker that carries the bytes; configured, never hard-coded twice. */
export const MEDIA_PROXY_URL = process.env.NEXT_PUBLIC_MEDIA_PROXY || ''

function proxyHost() {
  try {
    return new URL(MEDIA_PROXY_URL).hostname
  } catch {
    return 'not configured'
  }
}

async function probeSpotifyEmbed() {
  const { entity, error } = await fetchSpotifyEntity(PROBE_TRACK)
  if (!entity) throw new Error(error || 'no entity')
  const artists = Array.isArray(entity.artists) ? entity.artists.length : 0
  return `${entity.name ?? 'track'} · ${artists} artist`
}

async function probeYouTubeSearch() {
  const [music, web] = await Promise.all([
    searchYouTubeMusic(PROBE_QUERY),
    searchYouTubeWeb(PROBE_QUERY),
  ])
  if (music.length + web.length === 0) throw new Error('no results from either catalogue')
  return `${music.length} music · ${web.length} web`
}

async function probeSaveFrom() {
  const data = await resolveViaSaveFrom(PROBE_VIDEO)
  const audio = pickAudio(data)
  if (!audio) throw new Error('no audio stream returned')
  return `${audio.format.toUpperCase()} · ${audio.quality}`
}

async function probeMediaProxy() {
  if (!MEDIA_PROXY_URL) throw new Error('NEXT_PUBLIC_MEDIA_PROXY is not set')

  // The Worker answers a request with no target with 400 and a JSON error. That
  // proves it is deployed and routing without pulling a whole song through it.
  const res = await fetch(`${MEDIA_PROXY_URL}?probe=1`, {
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  if (res.status !== 400) throw new Error(`unexpected status ${res.status}`)

  const body = await res.json().catch(() => null)
  if (!body?.error) throw new Error('no JSON error from the Worker')
  return `CORS + Range · ${res.headers.get('access-control-allow-origin') || 'no ACAO'}`
}

export const UPSTREAMS = [
  {
    id: 'spotify-embed',
    label: 'Spotify Embed',
    host: 'open.spotify.com',
    role: 'primary',
    scope: 'metadata + track list',
    serves: false,
    detail: 'Reads the public embed page. No token, no oEmbed round trip.',
    run: probeSpotifyEmbed,
  },
  {
    id: 'youtube-search',
    label: 'YouTube Search',
    host: 'music.youtube.com · www.youtube.com',
    role: 'primary',
    scope: 'recording match',
    serves: false,
    detail:
      'Both InnerTube catalogues, merged. The music one ranks songs; the regular one still has the official upload.',
    run: probeYouTubeSearch,
  },
  {
    id: 'savefrom',
    label: 'SaveFrom Converter',
    host: 'api-wh.savefrom.co.id',
    role: 'primary',
    scope: 'audio stream',
    serves: true,
    detail: 'Signed client of the public converter. Produces the m4a file.',
    run: probeSaveFrom,
  },
  {
    id: 'media-proxy',
    label: 'Cloudflare Worker',
    host: proxyHost(),
    role: 'transport',
    scope: 'media transfer',
    serves: false,
    detail:
      'Carries the bytes to the browser with CORS and Range. The CDN refuses Vercel’s addresses, so this hop is required.',
    run: probeMediaProxy,
  },
]

/** Probe every upstream in parallel. Never throws. */
export async function probeAllUpstreams({ timeoutMs = 25000 } = {}) {
  const startedAll = Date.now()

  const results = await Promise.all(
    UPSTREAMS.map(async (upstream) => {
      const started = Date.now()
      try {
        const detail = await Promise.race([
          upstream.run(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('probe timed out')), timeoutMs)
          ),
        ])
        return {
          id: upstream.id,
          status: 'ok',
          ms: Date.now() - started,
          detail: String(detail),
        }
      } catch (error) {
        return {
          id: upstream.id,
          status: 'down',
          ms: Date.now() - started,
          detail: error?.message || 'no response',
        }
      }
    })
  )

  const byId = Object.fromEntries(results.map((r) => [r.id, r]))
  return {
    upstreams: UPSTREAMS.map((u) => ({ ...u, run: undefined, ...byId[u.id] })),
    healthy: results.filter((r) => r.status === 'ok').length,
    total: results.length,
    ms: Date.now() - startedAll,
  }
}
