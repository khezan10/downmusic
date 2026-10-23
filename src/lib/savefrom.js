/**
 * SaveFrom's signed converter — free, no API key, resolves YouTube to real
 * media URLs.
 *
 * SaveFrom signs every request with a routine that ships in its own JS bundle.
 * We reproduce that routine so the endpoint can be called without an account.
 * This is a client of a public web API, not a documented API — expect change.
 *
 * ── Self-healing ────────────────────────────────────────────────────────────
 * SaveFrom redeploys often, which changes the chunk filename, its content hash,
 * the module id inside the chunk, and the API path. Nothing is pinned:
 *   - chunk candidates are parsed out of app.js (id→name and id→hash maps)
 *   - every module the chunk registers is evaluated; the one whose default
 *     export resolves to a function is the signer
 *   - the API host comes from the page's `__CONFIG__.API_URL`
 *   - API paths are read out of the bundle and tried in order
 *   - a rejected signature invalidates the cache and re-discovers once
 */

import { createHash } from 'node:crypto'
import { createContext, runInContext } from 'node:vm'

const SITE = 'https://savefrom.co.id'
const FALLBACK_API_URL = 'https://api-wh.savefrom.co.id'
const FALLBACK_API_PATH = '/api/convert'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const CACHE_TTL_MS = 10 * 60 * 1000
let cache = { at: 0, sign: null, apiUrl: FALLBACK_API_URL, apiPaths: [FALLBACK_API_PATH] }

function evaluateChunk(code) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    URLSearchParams,
    URL,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    RegExp,
    Error,
    TypeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Map,
    Set,
    WeakMap,
    Symbol,
    Proxy,
    Reflect,
    Intl,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    // The chunk fetches a secret endpoint; the secret is embedded and the fetch
    // failure is swallowed, so a stub is enough.
    fetch: async () => ({ json: async () => ({}), ok: true, status: 200 }),
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  sandbox.navigator = { userAgent: UA }
  sandbox.location = {
    href: `${SITE}/`,
    hostname: 'savefrom.co.id',
    protocol: 'https:',
    reload() {},
  }
  sandbox.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    addEventListener() {},
    cookie: '',
    documentElement: { style: {} },
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
  }
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  sandbox.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  sandbox.XMLHttpRequest = function () {
    return { open() {}, send() {}, setRequestHeader() {}, addEventListener() {} }
  }
  sandbox.crypto = {
    subtle: {
      digest: async (algo, data) =>
        new Uint8Array(createHash('sha256').update(Buffer.from(data)).digest()),
    },
  }

  const captured = {}
  sandbox.webpackChunk = []
  sandbox.webpackChunk.push = (arr) => {
    if (arr && arr[1]) for (const k of Object.keys(arr[1])) captured[k] = arr[1][k]
  }

  createContext(sandbox)
  runInContext(code, sandbox, { timeout: 20000 })

  const modCache = {}
  function wr(id) {
    if (modCache[id]) return modCache[id].exports
    const mod = { exports: {} }
    modCache[id] = mod
    if (captured[id]) captured[id](wr, mod.exports, wr)
    return mod.exports
  }
  // Load-bearing: webpack's ES-module getter helper. Without it the chunk's
  // `default` export is invisible and the module appears to export nothing.
  wr.d = (exports, definition) => {
    for (const k in definition) {
      if (!Object.prototype.hasOwnProperty.call(exports, k)) {
        Object.defineProperty(exports, k, { enumerable: true, get: definition[k] })
      }
    }
  }
  wr.r = (e) => {
    Object.defineProperty(e, '__esModule', { value: true })
    Object.defineProperty(e, Symbol.toStringTag, { value: 'Module' })
  }
  wr.n = (id) => wr(id)
  wr.o = (o, p) => Object.prototype.hasOwnProperty.call(o, p)
  wr.t = (v) => v
  wr.p = ''

  return Object.keys(captured)
    .map(Number)
    .map((id) => ({ id, exports: wr(id) }))
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  return res.text()
}

/** Parse every chunk the app could load out of app.js. */
export function discoverChunkCandidates(appJs) {
  const nameMap = new Map()
  const hashMap = new Map()

  for (const m of appJs.matchAll(/\{([0-9]{1,4}):"([a-zA-Z0-9._-]+)"/g)) {
    const [, id, value] = m
    if (/^[0-9a-f]{8,}$/i.test(value)) hashMap.set(id, value)
    else if (/[a-zA-Z]/.test(value)) nameMap.set(id, value)
  }

  const candidates = []
  for (const [id, name] of nameMap) {
    const hash = hashMap.get(id)
    if (hash) candidates.push({ id: Number(id), name, hash })
  }

  candidates.sort((a, b) => {
    const score = (c) => (/link|convert|api/i.test(c.name) ? 0 : 1)
    return score(a) - score(b) || a.id - b.id
  })
  return candidates
}

/**
 * Find the API paths the bundle talks to, best guess first.
 * Collected rather than chosen: a renamed endpoint 404s and the next is tried.
 */
export function discoverApiPaths(appJs) {
  const SIGNED_MARKERS = ['subscribeSignedRequestBody', 'sf_url', '_tsc', 'baseUrl']

  const found = new Map()
  for (const m of appJs.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]+)["'`]/g)) {
    const path = m[1]
    const start = Math.max(0, m.index - 700)
    const context = appJs.slice(start, m.index + 700)

    let score = 0
    for (const marker of SIGNED_MARKERS) if (context.includes(marker)) score++
    if (/convert/i.test(path)) score += 3
    if (/\/ig\/|\/v1\//i.test(path)) score -= 3

    if (!found.has(path) || found.get(path).score < score) found.set(path, { path, score })
  }

  const ranked = [...found.values()].sort((a, b) => b.score - a.score).map((x) => x.path)
  if (!ranked.includes(FALLBACK_API_PATH)) ranked.push(FALLBACK_API_PATH)
  return ranked
}

/** Race every candidate against a timeout: a hanging promise must not hang us. */
async function pickSigner(modules) {
  for (const mod of modules) {
    const exported = mod.exports && mod.exports.default
    if (!exported) continue

    let resolved = exported
    if (typeof resolved.then === 'function') {
      try {
        resolved = await Promise.race([
          resolved,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('module export timed out')), 5000)
          ),
        ])
      } catch {
        continue
      }
    }
    if (typeof resolved === 'function') return resolved
  }
  return null
}

async function loadSigner() {
  const html = await fetchText(`${SITE}/`)
  const apiUrl = (html.match(/API_URL\s*:\s*"([^"]+)"/) || [])[1] || FALLBACK_API_URL

  const appJsUrl = (html.match(/<script[^>]+src="(\/js\/app\.js[^"]*)"/) || [])[1]
  if (!appJsUrl) throw new Error('app.js script tag not found')
  const appJs = await fetchText(new URL(appJsUrl, SITE).href)

  const apiPaths = discoverApiPaths(appJs)
  const candidates = discoverChunkCandidates(appJs)
  if (candidates.length === 0) throw new Error('no signing chunk could be discovered in app.js')

  const failures = []
  for (const cand of candidates) {
    try {
      const code = await fetchText(`${SITE}/js/${cand.name}.js?ch=${cand.hash}.js`)
      const modules = evaluateChunk(code)
      const sign = await pickSigner(modules)
      if (sign) return { sign, apiUrl, apiPaths }
      failures.push(`chunk ${cand.id} (${cand.name}): no module exported a function`)
    } catch (e) {
      failures.push(`chunk ${cand.id} (${cand.name}): ${e.message}`)
    }
  }

  throw new Error(`signer discovery failed — ${failures.join('; ')}`)
}

async function getSigner() {
  if (cache.sign && Date.now() - cache.at < CACHE_TTL_MS) return cache
  const loaded = await loadSigner()
  cache = { at: Date.now(), ...loaded }
  return cache
}

function bustCache() {
  cache = { at: 0, sign: null, apiUrl: FALLBACK_API_URL, apiPaths: [FALLBACK_API_PATH] }
}

async function callConvert(sign, apiUrl, apiPaths, url) {
  const signed = await sign(url)
  const body = new URLSearchParams(signed).toString()
  let lastError = null

  for (const apiPath of apiPaths) {
    const res = await fetch(`${apiUrl}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: SITE,
        Referer: `${SITE}/`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
      },
      // Form-encoded, not JSON — JSON silently becomes URL_IS_EMPTY.
      body,
      signal: AbortSignal.timeout(45000),
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      lastError = new Error('The resolver returned an unexpected response. Please try again.')
      continue
    }

    const media = Array.isArray(data.url) ? data.url : []
    if (media.length === 0) {
      const reason = data.message || data.response_type || data.code || 'no media returned'
      const lower = String(reason).toLowerCase()
      if (lower.includes('not found')) {
        throw new Error(
          'This track could not be resolved. The upload may be private, deleted or region-locked.'
        )
      }
      const err = new Error(`The resolver could not handle this track (${reason}).`)
      err.code = data.code
      throw err
    }

    if (apiPaths[0] !== apiPath) {
      apiPaths.splice(apiPaths.indexOf(apiPath), 1)
      apiPaths.unshift(apiPath)
    }
    return data
  }

  throw lastError || new Error('The resolver could not handle this track.')
}

/** Resolve any media URL through SaveFrom. Returns the raw upstream payload. */
export async function resolveViaSaveFrom(url) {
  let signer
  try {
    signer = await getSigner()
  } catch {
    bustCache()
    signer = await loadSigner()
  }

  try {
    return await callConvert(signer.sign, signer.apiUrl, signer.apiPaths, url)
  } catch (e) {
    const recoverable =
      /signer|chunk|discovery|invalid_request|signature/i.test(e.message) ||
      e.code === 'invalid_request'
    if (!recoverable) throw e
    bustCache()
    const fresh = await loadSigner()
    return await callConvert(fresh.sign, fresh.apiUrl, fresh.apiPaths, url)
  }
}

/**
 * Unwrap a converter URL to the real CDN link.
 * `https://media.sf-converter.com/get?__sig=…&uri=<encoded real url>` → the uri.
 */
export function unwrapSaveFromConverter(url) {
  if (!url || typeof url !== 'string') return url
  if (!/sf-converter\.com\/get/i.test(url)) return url
  try {
    const direct = new URL(url).searchParams.get('uri')
    if (direct && /^https?:\/\//i.test(direct)) return direct
  } catch {
    /* not parseable — keep the original */
  }
  return url
}

/**
 * Whether a URL is a *file* we can hand to a browser.
 *
 * SaveFrom mixes two kinds of entries for YouTube:
 *   https://rr3---sn-….googlevideo.com/videoplayback?…   real bytes, Range-capable
 *   https://du.sf-converter.com/convert?payload=…        an HTML page, not a file
 * Handing the second one to a user produces a broken download, so it is dropped.
 */
export function isDirectMediaUrl(url) {
  if (!url || typeof url !== 'string') return false
  let parsed
  try {
    parsed = new URL(unwrapSaveFromConverter(url))
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com')) return true
  // Any other host is accepted only when the converter hands a plain file path.
  return /\/get$/i.test(parsed.pathname) && parsed.searchParams.has('uri')
}

/**
 * Which extensions count as audio.
 *
 * `webm` is deliberately absent: in this payload the webm entries are *video*
 * (their `subname` is 360/480/720/1080/1440/2160), so treating webm as audio
 * would hand out a video stream with an .mp3 name.
 */
const AUDIO_EXT_RANK = { m4a: 3, mp3: 3, opus: 2 }

/**
 * Pick the best audio entry from a SaveFrom payload.
 * m4a (AAC) plays everywhere and is what a music downloader should hand out;
 * opus is the smaller alternative.
 */
export function pickAudio(data) {
  const media = Array.isArray(data?.url) ? data.url : []
  const audio = media
    .filter((m) => m && AUDIO_EXT_RANK[m.ext] && isDirectMediaUrl(m.url))
    .map((m) => ({
      format: m.ext,
      quality: m.ext === 'm4a' ? 'AAC 128 kbps' : m.subname ? `${m.subname} kbps` : m.ext,
      bitrate: parseInt(m.subname, 10) || 0,
      url: unwrapSaveFromConverter(m.url),
      rank: AUDIO_EXT_RANK[m.ext],
    }))
    .sort((a, b) => b.rank - a.rank || b.bitrate - a.bitrate)

  return audio[0] ?? null
}

/** Pick the highest-quality direct mp4. */
export function pickVideo(data) {
  const media = Array.isArray(data?.url) ? data.url : []
  const videos = media
    .filter((m) => m && m.ext === 'mp4' && isDirectMediaUrl(m.url))
    .map((m) => {
      const height = parseInt(m.subname, 10) || 0
      return {
        format: 'mp4',
        quality: height ? `${height}p` : m.name || 'MP4',
        height,
        url: unwrapSaveFromConverter(m.url),
      }
    })
    .sort((a, b) => b.height - a.height)

  const seen = new Set()
  return videos.filter((v) => (seen.has(v.quality) ? false : seen.add(v.quality)))
}

/**
 * The converter's own file link, used when the direct CDN URL is refused.
 *
 * `du.sf-converter.com/convert?payload=…` streams the same recording from
 * SaveFrom's servers. It is a *video* file, so the browser has to decode the
 * audio track out of it — but it is the only media host the deployed edge
 * runtime can reach at all (googlevideo answers 403 to datacenter addresses).
 */
export function pickFallbackMedia(data) {
  const media = Array.isArray(data?.url) ? data.url : []
  const converters = media
    .filter((m) => m && m.ext === 'mp4' && /^https:\/\/du\.sf-converter\.com\//.test(String(m.url)))
    .map((m) => ({ quality: parseInt(m.subname, 10) || 0, url: m.url }))
    .sort((a, b) => a.quality - b.quality)

  // Prefer the smallest usable quality: the whole file is transferred to the
  // browser, and 480p is already ~15 MB for a four-minute track.
  return converters.find((c) => c.quality >= 480) || converters[0] || null
}

/** Title/thumbnail/duration from a SaveFrom payload. */
export function describeMedia(data) {
  const meta = data?.meta || {}
  return {
    title: meta.title ? String(meta.title).replace(/\s*\(\d+K Remaster\)\s*/i, '').trim() : null,
    author: meta.author?.nickname || meta.author?.unique_id || null,
    thumbnail: typeof data?.thumb === 'string' ? unwrapSaveFromConverter(data.thumb) : null,
    duration: toSeconds(meta.duration),
    hosting: data?.hosting ?? null,
  }
}

export function toSeconds(value) {
  if (value == null) return null
  if (typeof value === 'number') return Math.round(value)
  const text = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text))
  const parts = text.split(':').map((n) => parseInt(n, 10))
  if (parts.some(Number.isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? null
}

/** Test seam: drop the cached signer so a probe always re-discovers. */
export function _resetSignerCache() {
  bustCache()
}
