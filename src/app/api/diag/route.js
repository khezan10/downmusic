import { NextResponse } from 'next/server'
import { resolveViaSaveFrom } from '@/lib/savefrom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/diag?url=<youtube watch url>
 *
 * Ops-only view of what the converter actually returns from the network the
 * deployment runs on. A free converter treats a datacenter address differently
 * from a home connection, and the only way to see that is from inside the
 * deployment.
 *
 * Guarded by CRON_SECRET; without it the route answers 404 so it is invisible
 * to a casual visitor.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  const key = request.nextUrl.searchParams.get('key') || ''
  const authorized = Boolean(secret) && (header === `Bearer ${secret}` || key === secret)

  if (!authorized) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const target =
    request.nextUrl.searchParams.get('url') || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  try {
    const raw = await resolveViaSaveFrom(target)
    const media = Array.isArray(raw?.url) ? raw.url : []

    // The converter answers with a different shape depending on the caller's
    // network: a home connection gets `url[]` full of m4a/opus entries, while a
    // datacenter address gets one mp4 plus `audioTracks`/`itags`. Both shapes
    // have to be visible here, so the whole payload is summarised.
    const trim = (value, depth = 0) => {
      if (depth > 4) return '…'
      if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 160)}…` : value
      if (Array.isArray(value)) return value.slice(0, 6).map((v) => trim(v, depth + 1))
      if (value && typeof value === 'object') {
        const out = {}
        for (const [k, v] of Object.entries(value).slice(0, 20)) out[k] = trim(v, depth + 1)
        return out
      }
      return value
    }

    return NextResponse.json({
      ok: true,
      target,
      keys: Object.keys(raw || {}),
      meta: raw?.meta || null,
      hosting: raw?.hosting ?? null,
      hasHd: Boolean(raw?.hd),
      mediaCount: media.length,
      media: media.slice(0, 30).map((m) => ({
        ext: m?.ext,
        subname: m?.subname,
        name: m?.name,
        head: String(m?.url || '').slice(0, 110),
      })),
      audioTracks: trim(raw?.audioTracks),
      itags: trim(raw?.itags),
      stream: trim(raw?.stream),
      videoQuality: trim(raw?.video_quality),
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error) }, { status: 200 })
  }
}
