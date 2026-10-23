/**
 * The download chain, in one place so the API routes and the health probe can
 * never disagree about what this app actually does.
 *
 *   Spotify link ──▶ embed page  ──▶ title / artist / track list
 *                ──▶ YouTube Music (InnerTube search, scored by runtime)
 *                ──▶ converter ──▶ real audio stream (m4a/opus)
 *                ──▶ browser    ──▶ decoded and re-encoded as MP3
 *
 * The last step happens in the page, not here: a real MP3 is a transcode and a
 * 4-minute track at 192 kbps is ~5.5 MB, which no longer fits a serverless
 * response. The server's job ends at handing over the original stream.
 *
 * Verified end-to-end 2026-10-24: the converter returns direct
 * `googlevideo.com/videoplayback` audio (itag 140, ~3.4 MB for 3:33) that
 * serves HTTP 206 with `Accept-Ranges: bytes`.
 */

import {
  describeMedia,
  pickAudio,
  pickVideo,
  resolveViaSaveFrom,
} from './savefrom.js'
import { findYouTubeMatches } from './youtube.js'
import { resolveSpotifyLink } from './spotify.js'

/** Cap on how long a whole resolve may take (Vercel function budget). */
const DEFAULT_BUDGET_MS = 45000

function remaining(startedAt, budget) {
  return Math.max(1000, budget - (Date.now() - startedAt))
}

/**
 * Resolve one track to a downloadable audio URL.
 *
 * The returned `audio.url` is the original stream; the browser turns it into
 * the MP3 the visitor asked for.
 */
export async function resolveTrack(
  { title, artist, spotifyUrl = null, thumbnail = null, album = null, duration = null },
  { budgetMs = DEFAULT_BUDGET_MS, skip = 0 } = {}
) {
  const startedAt = Date.now()

  if (!title) {
    return { success: false, error: 'A track title is required.' }
  }

  const candidates = await findYouTubeMatches(title, artist, {
    // The Spotify runtime is the reference for choosing between the studio
    // recording and a live/alternate version of the same song.
    duration: duration || 0,
    limit: 3 + skip,
    timeoutMs: Math.min(15000, remaining(startedAt, budgetMs)),
  })

  // `skip` lets the client come back for the next recording when the first one
  // produced a URL the CDN no longer serves (the converter caches results, and a
  // cached googlevideo host can be gone).
  const usable = candidates.slice(skip)
  candidates.length = 0
  candidates.push(...usable)

  if (candidates.length === 0) {
    return {
      success: true,
      title,
      artist: artist || 'Unknown artist',
      album,
      thumbnail,
      duration: duration || null,
      audio: null,
      videos: [],
      spotifyUrl,
      upstream: null,
      note: 'No audio match was found for this track.',
    }
  }

  // Candidates are tried in order, and each one is asked more than once.
  //
  // Two things make the retry necessary, both measured from the deployed
  // function rather than a home connection:
  //   - the converter answers "no audio stream" for a valid video now and then
  //   - on a fresh network the FIRST response carries only one video entry,
  //     because the audio streams are still being prepared; a second call a
  //     moment later returns m4a + opus as well
  let raw = null
  let match = candidates[0]
  let resolveError = null

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (Date.now() - startedAt > budgetMs) break
      try {
        const data = await resolveViaSaveFrom(candidate.watchUrl)
        if (pickAudio(data)) {
          raw = data
          match = candidate
          break
        }
        resolveError = 'The converter returned no audio stream for this track.'
        // Give the converter a moment before asking again; an immediate repeat
        // usually returns the same payload.
        await delay(700)
      } catch (error) {
        resolveError = error.message
        break // a real error will not fix itself on an immediate retry
      }
    }
    if (raw) break
  }

  const audio = raw ? pickAudio(raw) : null
  const videos = raw ? pickVideo(raw).slice(0, 4) : []
  const described = raw ? describeMedia(raw) : null

  const note = audio
    ? null
    : resolveError
      ? `The audio converter could not resolve this track (${resolveError}).`
      : 'The converter returned no audio stream for this track.'

  return {
    success: true,
    title,
    artist: artist || described?.author || 'Unknown artist',
    album,
    thumbnail: thumbnail || described?.thumbnail || match.thumbnail || null,
    // Spotify's own runtime wins: the converter's metadata describes whatever
    // upload it resolved, which is not always the studio recording.
    duration: duration || described?.duration || match.duration || null,
    audio: audio
      ? {
          url: audio.url,
          format: audio.format, // original container; the browser outputs mp3
          quality: audio.quality,
          filename: `${artist ? `${artist} - ` : ''}${title}`,
        }
      : null,
    videos: videos.map((v) => ({
      ...v,
      filename: `${artist ? `${artist} - ` : ''}${title} (${v.quality}).mp4`,
    })),
    spotifyUrl,
    upstream: audio ? 'savefrom+youtube-music' : match ? 'youtube-music' : 'spotify-embed',
    note,
  }
}

/**
 * Resolve a pasted Spotify link.
 * Returns `{ success, kind, track?, collection?, error }`.
 */
export async function resolveSpotifyInput(input, options = {}) {
  const { data, error } = await resolveSpotifyLink(input)
  if (!data) {
    // A malformed link is the caller's mistake (400); a failing upstream is not
    // (502). The route needs to tell them apart.
    const invalidUrl = /not a spotify|that is not a spotify/i.test(error || '')
    return {
      success: false,
      code: invalidUrl ? 'invalid_url' : 'upstream_error',
      error: error || 'Could not read that Spotify link.',
    }
  }

  if (data.kind === 'track') {
    const track = await resolveTrack(
      {
        title: data.name,
        artist: data.artist,
        album: data.album,
        spotifyUrl: data.spotifyUrl ?? null,
        thumbnail: data.cover,
        duration: data.duration,
      },
      options
    )
    return {
      success: track.success,
      kind: 'track',
      cover: data.cover,
      track: { ...track, spotifyUrl: data.spotifyUrl ?? track.spotifyUrl },
      error: track.success ? null : track.error,
    }
  }

  return {
    success: true,
    kind: data.kind,
    cover: data.cover,
    collection: {
      kind: data.kind,
      name: data.name,
      artist: data.artist,
      cover: data.cover,
      releaseDate: data.releaseDate,
      total: data.total,
      tracks: data.tracks,
      spotifyUrl: `https://open.spotify.com/${data.kind}/${data.id}`,
    },
  }
}
