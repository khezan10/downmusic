import { NextResponse } from 'next/server'
import { resolveSpotifyInput, resolveTrack } from '@/lib/resolve'
import { logActivity } from '@/lib/mongodb'
import { getClientIP, maskIP } from '@/lib/format'
import { rateLimit } from '@/lib/rate-limit'

// The converter lives outside Vercel's network; give it room.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/resolve
 *   { url }                          -> track, album or playlist
 *   { title, artist, previewUrl… }    -> one track from a collection row
 *
 * A collection is returned as a list, without resolving 50 audio files: each
 * track is resolved on demand, which keeps every request inside the timeout.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Expected a JSON body.' }, { status: 400 })
  }

  const ip = getClientIP(request.headers)

  // Each resolve is a few seconds of upstream work; 30 a minute is a generous
  // ceiling for one person and stops a script.
  const limit = rateLimit(`${ip}:resolve`, { limit: 30, windowMs: 60_000 })
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many resolves from this address. Wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  try {
    // A single track selected from a collection.
    if (!body?.url) {
      const { title, artist, thumbnail, album, spotifyUrl, duration, skip } = body ?? {}
      if (!title || typeof title !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Send a Spotify link, or a track title.' },
          { status: 400 }
        )
      }

      const track = await resolveTrack(
        {
          title,
          artist,
          thumbnail,
          album,
          spotifyUrl,
          duration,
        },
        { skip: Math.max(0, Math.min(3, Number(skip) || 0)) }
      )
      if (!track.success) {
        return NextResponse.json({ success: false, error: track.error }, { status: 502 })
      }

      await logActivity({
        kind: 'track',
        platform: 'spotify',
        originalUrl: spotifyUrl || '',
        ip,
        ipMasked: maskIP(ip),
        title: track.title,
        author: track.artist,
        thumbnail: track.thumbnail || '',
        duration: track.duration || 0,
        upstream: track.upstream || 'unknown',
        hasAudio: Boolean(track.audio),
        format: track.audio?.format ?? null,
      })

      return NextResponse.json({ success: true, kind: 'track', track })
    }

    const url = String(body.url).trim()
    const result = await resolveSpotifyInput(url, {
      skip: Math.max(0, Math.min(3, Number(body.skip) || 0)),
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Could not resolve that link.' },
        { status: result.code === 'invalid_url' ? 400 : 502 }
      )
    }

    if (result.kind === 'track') {
      const track = result.track
      await logActivity({
        kind: 'track',
        platform: 'spotify',
        originalUrl: url,
        ip,
        ipMasked: maskIP(ip),
        title: track.title,
        author: track.artist,
        thumbnail: track.thumbnail || '',
        duration: track.duration || 0,
        upstream: track.upstream || 'unknown',
        hasAudio: Boolean(track.audio),
        format: track.audio?.format ?? null,
      })

      return NextResponse.json({
        success: true,
        kind: 'track',
        track: { ...track, cover: result.cover },
      })
    }

    // Collections are not logged here: nothing has been downloaded yet. Each
    // track that the visitor actually grabs is logged on its own resolve.
    return NextResponse.json({
      success: true,
      kind: result.kind,
      collection: result.collection,
    })
  } catch (error) {
    console.error('resolve failed:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Resolve failed.' },
      { status: 500 }
    )
  }
}
