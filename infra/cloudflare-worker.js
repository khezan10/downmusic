/**
 * Cloudflare Worker: media proxy for downmusic.
 *
 * Deployed at https://media.mzg.my.id (a Worker route on the mzg.my.id zone, so
 * the deployment URL carries no personal account name).
 *
 * Why it exists: YouTube refuses media requests from datacenter addresses, and
 * Vercel's functions are datacenter addresses — the same URL answers 403 there
 * and 206 from a home connection. Cloudflare's egress is accepted, so the
 * browser fetches the audio through this Worker instead. It also returns the
 * CORS headers the CDN does not, which is what makes a client-side MP3 encode
 * possible at all.
 *
 * It is not an open proxy: a fixed host allowlist, private-address rejection,
 * the redirect target checked again, and an Origin allowlist so other sites
 * cannot piggy-back on it.
 *
 * Deploy: put this file in the Worker named `downmusic-media`, with the
 * workers.dev subdomain enabled.
 */

const ALLOWED = ['googlevideo.com', 'sf-converter.com']
// Production only: a localhost origin would let a dev machine ride on the
// deployed Worker, and nothing local belongs in this deployment.
const ALLOWED_ORIGINS = ['https://downmusic.vercel.app']
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Range,Content-Length,Content-Type,Accept-Ranges',
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

function hostAllowed(host) {
  const h = String(host || '').toLowerCase()
  return ALLOWED.some((entry) => h === entry || h.endsWith(`.${entry}`))
}

function isPrivate(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split('.').map(Number)
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true
    if (p[0] === 169 && p[1] === 254) return true
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
    if (p[0] === 192 && p[1] === 168) return true
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true
  }
  if (h === '::1' || h === '::' || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method not allowed' }, 405)
    }

    const origin = request.headers.get('origin')
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403)

    const target = url.searchParams.get('url')
    if (!target) return json({ error: 'url parameter is required' }, 400)

    let parsed
    try {
      parsed = new URL(target)
    } catch {
      return json({ error: 'url is not valid' }, 400)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return json({ error: 'only http(s)' }, 400)
    }
    if (isPrivate(parsed.hostname)) return json({ error: 'private hosts are not allowed' }, 403)
    if (!hostAllowed(parsed.hostname)) return json({ error: 'host is not a media CDN' }, 403)

    const range = request.headers.get('range')
    const upstreamHeaders = { 'User-Agent': UA, Accept: '*/*' }
    if (range) upstreamHeaders.Range = range

    // The converter alternates between the file and its landing page.
    let upstream
    for (let attempt = 0; attempt < 4; attempt += 1) {
      upstream = await fetch(parsed.toString(), { headers: upstreamHeaders, redirect: 'follow' })
      const type = upstream.headers.get('content-type') || ''
      if (type.includes('text/html')) {
        await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 250))
        continue
      }
      break
    }

    try {
      const finalUrl = new URL(upstream.url)
      if (isPrivate(finalUrl.hostname) || !hostAllowed(finalUrl.hostname)) {
        return json({ error: 'redirected somewhere unsafe' }, 403)
      }
    } catch {
      return json({ error: 'unparseable upstream url' }, 502)
    }

    if (!upstream.ok && upstream.status !== 206) {
      return json(
        {
          error: `media CDN answered ${upstream.status}`,
          retryable: upstream.status === 403 || upstream.status >= 500,
        },
        502
      )
    }

    const headers = new Headers(CORS)
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('Cache-Control', 'no-store')

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    })
  },
}
