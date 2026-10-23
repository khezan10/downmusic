import { NextResponse } from 'next/server'
import { resolveViaSaveFrom } from '@/lib/savefrom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/diag?url=<youtube watch url>
 *
 * Ops-only view of the converter payload from the network the deployment runs
 * on. A free converter treats a datacenter address differently from a home
 * connection — that is exactly how the "converter returned no audio" bug was
 * found — so being able to see the raw shape matters.
 *
 * Deliberately narrow: it resolves through the app's own converter client, it
 * does **not** proxy arbitrary URLs (that would be an SSRF gadget), and without
 * the secret it answers 404 so it is invisible to a casual visitor.
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

  // Only the app's own media sources may be inspected.
  if (!/^https:\/\/(www\.|music\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(target)) {
    return NextResponse.json({ ok: false, error: 'only youtube watch urls are inspected' })
  }

  try {
    const raw = await resolveViaSaveFrom(target)
    const media = Array.isArray(raw?.url) ? raw.url : []

    return NextResponse.json({
      ok: true,
      target,
      keys: Object.keys(raw || {}),
      meta: raw?.meta || null,
      hosting: raw?.hosting ?? null,
      mediaCount: media.length,
      exts: [...new Set(media.map((m) => m?.ext))],
      media: media.slice(0, 30).map((m) => ({
        ext: m?.ext,
        subname: m?.subname,
        name: m?.name,
        host: (() => {
          try {
            return new URL(String(m?.url)).hostname
          } catch {
            return 'unparseable'
          }
        })(),
      })),
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error) })
  }
}
