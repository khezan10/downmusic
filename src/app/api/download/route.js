import { NextResponse } from 'next/server'
import {
  getClientIP,
  isAllowedHost,
  isPrivateHost,
  safeFilename,
} from '@/lib/format'
import { rateLimit, redirectIsSafe } from '@/lib/rate-limit'

/**
 * Media proxy.
 *
 * **Runs on the edge runtime on purpose.** Measured from the deployed project:
 * the Node runtime is refused by the media CDNs — googlevideo answers 403 and
 * the converter serves an HTML page — while the same URLs answer 206 with real
 * bytes from the edge runtime. That difference is the whole reason this route
 * declares `runtime = 'edge'`.
 *
 * It is not an open proxy:
 *   - http(s) only
 *   - private/loopback/link-local addresses refused before the allowlist
 *   - the host must be on a fixed allowlist (plus DOWNLOAD_ALLOWED_HOSTS)
 *   - the URL the fetch actually landed on after redirects is checked again
 *   - per-instance rate limiting with Retry-After
 *
 * The browser fetches it in 3 MB ranges (see lib/download-client.js) because a
 * single response has a size ceiling.
 */

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const MEDIA_HOSTS = ['googlevideo.com', 'sf-converter.com']

function allowlist() {
  const extra = (process.env.DOWNLOAD_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...MEDIA_HOSTS, ...extra]
}

const PASS_THROUGH = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']

export async function GET(request) {
  const params = request.nextUrl.searchParams
  const raw = params.get('url')
  const download = params.get('download') !== '0'
  const filename = safeFilename(params.get('filename') || 'downmusic-audio')

  const ip = getClientIP(request.headers)
  const limit = rateLimit(`${ip}:download`, { limit: 240, windowMs: 60_000 })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many download requests. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  if (!raw) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 })
  }

  let target
  try {
    target = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'url is not a valid absolute URL' }, { status: 400 })
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return NextResponse.json({ error: 'only http(s) URLs can be proxied' }, { status: 400 })
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: 'private hosts are not allowed' }, { status: 403 })
  }

  if (!isAllowedHost(target.hostname, allowlist())) {
    return NextResponse.json(
      { error: `host ${target.hostname} is not a media CDN this app serves` },
      { status: 403 }
    )
  }

  const range = request.headers.get('range')
  const upstreamHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
  }
  if (range) upstreamHeaders.Range = range

  try {
    const upstream = await fetch(target, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(55_000),
      cache: 'no-store',
      redirect: 'follow',
    })

    // A CDN that answers 302 to a private address would turn this route into an
    // SSRF gadget, so the hop the fetch actually landed on has to pass the same
    // rules as the URL that was asked for.
    if (
      !redirectIsSafe(upstream.url, {
        allowlist: allowlist(),
        isPrivate: isPrivateHost,
        isAllowed: isAllowedHost,
      })
    ) {
      return NextResponse.json(
        { error: 'the media CDN redirected somewhere unsafe' },
        { status: 403 }
      )
    }

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `the media CDN answered HTTP ${upstream.status}` },
        { status: upstream.status === 404 ? 404 : 502 }
      )
    }

    const headers = new Headers()
    for (const name of PASS_THROUGH) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('Cache-Control', 'no-store')
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers })
  } catch (error) {
    console.error('proxy failed:', error?.message || error)
    return NextResponse.json({ error: 'the media CDN could not be reached' }, { status: 504 })
  }
}
