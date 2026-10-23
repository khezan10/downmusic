import { NextResponse } from 'next/server'
import {
  getClientIP,
  isAllowedHost,
  isPrivateHost,
  maskIP,
  safeFilename,
} from '@/lib/format'
import { rateLimit, redirectIsSafe } from '@/lib/rate-limit'
import { logActivity } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Media CDNs this app is allowed to proxy.
 *
 * This is not an open proxy. The list is fixed by design (the two hosts the
 * resolver produces) plus an optional env extension, and private/loopback
 * addresses are rejected before the allowlist is even consulted. A public
 * `?url=` route that fetches anything is an open relay and an SSRF hole.
 */
const MEDIA_HOSTS = ['googlevideo.com', 'sf-converter.com']

function allowlist() {
  const extra = (process.env.DOWNLOAD_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...MEDIA_HOSTS, ...extra]
}

/** Copy only headers that matter for a ranged file transfer. */
const PASS_THROUGH = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']

export async function GET(request) {
  const params = request.nextUrl.searchParams
  const raw = params.get('url')
  const download = params.get('download') !== '0'
  const filename = safeFilename(params.get('filename') || 'downmusic-audio')

  const ip = getClientIP(request.headers)

  // A chunked download issues several ranged requests for one file, so the
  // budget is per minute and generous for a real playlist.
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
      signal: AbortSignal.timeout(55000),
      cache: 'no-store',
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
      return NextResponse.json({ error: 'the media CDN redirected somewhere unsafe' }, { status: 403 })
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

    // Count the transfer in the public activity log, but only the first chunk —
    // a chunked download issues several ranged requests for one file.
    if (!range || /^bytes=0-/.test(range)) {
      await logActivity({
        kind: 'transfer',
        platform: 'spotify',
        originalUrl: target.origin,
        ip,
        ipMasked: maskIP(ip),
        title: filename,
        upstream: target.hostname.endsWith('googlevideo.com') ? 'savefrom+youtube-music' : 'savefrom',
        format: filename.split('.').pop(),
      })
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers })
  } catch (error) {
    console.error('proxy failed:', error)
    return NextResponse.json({ error: 'the media CDN could not be reached' }, { status: 504 })
  }
}
