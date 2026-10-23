/**
 * GET /api/probe-edge?url=<media url>&key=<CRON_SECRET>
 *
 * Vercel's Node runtime is refused by the media CDNs (403 from googlevideo, an
 * HTML page instead of the file from the converter). The edge runtime has a
 * different egress, so this route measures whether that path is usable before
 * the app is built around it.
 *
 * Guarded, and it never returns more than the requested slice.
 */
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(request.url)
  const key = url.searchParams.get('key') || ''
  if (!secret || key !== secret) {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
  }

  const target = url.searchParams.get('url')
  if (!target) {
    return new Response(JSON.stringify({ error: 'url is required' }), { status: 400 })
  }

  const started = Date.now()
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: '*/*',
        Range: 'bytes=0-2047',
      },
      signal: AbortSignal.timeout(20_000),
    })

    const bytes = new Uint8Array(await upstream.arrayBuffer())
    return new Response(
      JSON.stringify({
        ok: true,
        status: upstream.status,
        ms: Date.now() - started,
        contentType: upstream.headers.get('content-type'),
        contentRange: upstream.headers.get('content-range'),
        finalUrl: String(upstream.url).slice(0, 100),
        bytes: bytes.length,
        magic: Array.from(bytes.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' '),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, ms: Date.now() - started, error: String(error?.message || error) }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }
}
