/**
 * The upstream registry.
 *
 * One list, imported by the probe route, the health route, the resolve path and
 * the UI. A monitor that is built from a second, hand-written list drifts from
 * reality within a week.
 *
 * Rules learned the hard way:
 *  - a probe must use a target that upstream actually supports (SaveFrom: a
 *    YouTube watch URL; Spotify embed: a track page), or it reports a false down
 *  - a probe must send the same headers as production, or it reports a false up
 *  - "role" (static) and "status" (probed) are different things and never mixed
 */

import { pickAudio, resolveViaSaveFrom } from './savefrom.js'
import { searchYouTubeMusic } from './youtube.js'
import { fetchSpotifyEntity } from './spotify.js'

/** A stable, public, short video used only to exercise the converter. */
const PROBE_VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const PROBE_TRACK = { type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' }

async function probeSaveFrom() {
  const data = await resolveViaSaveFrom(PROBE_VIDEO)
  const audio = pickAudio(data)
  if (!audio) throw new Error('no audio stream returned')
  return `${audio.format.toUpperCase()} · ${audio.quality}`
}

async function probeYouTubeMusic() {
  const hits = await searchYouTubeMusic('never gonna give you up rick astley')
  if (hits.length === 0) throw new Error('no results')
  return `${hits.length} match${hits.length === 1 ? '' : 'es'}`
}

async function probeSpotifyEmbed() {
  const { entity, error } = await fetchSpotifyEntity(PROBE_TRACK)
  if (!entity) throw new Error(error || 'no entity')
  return `${entity.name ?? 'track'} · ${Array.isArray(entity.artists) ? entity.artists.length : 0} artist`
}

export const UPSTREAMS = [
  {
    id: 'savefrom',
    label: 'SaveFrom Converter',
    host: 'api-wh.savefrom.co.id',
    role: 'primary',
    scope: 'audio + video',
    detail: 'Signed client of the public converter. Produces the m4a/mp4 files.',
    run: probeSaveFrom,
  },
  {
    id: 'youtube-music',
    label: 'YouTube Music',
    host: 'music.youtube.com',
    role: 'primary',
    scope: 'track matching',
    detail: 'InnerTube search. Maps a Spotify track to its recording.',
    run: probeYouTubeMusic,
  },
  {
    id: 'spotify-embed',
    label: 'Spotify Embed',
    host: 'open.spotify.com',
    role: 'primary',
    scope: 'metadata + track list',
    detail: 'Reads the public embed page. No token, no oEmbed round trip.',
    run: probeSpotifyEmbed,
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
