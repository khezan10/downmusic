/**
 * Pure formatting/parsing helpers.
 *
 * Deliberately dependency-free ESM so `node --test` can import the exact code
 * the app runs — a test against a copy of the logic proves nothing.
 */

/** Mask the last octet of an IPv4 address, for the public activity log. */
export function maskIP(ip) {
  if (!ip || typeof ip !== 'string') return '***.***.***.***'
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.***`
  return '***.***.***.***'
}

/** Read the caller's address from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIP(headers) {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip') || '0.0.0.0'
}

/**
 * Quality labels from resolvers are inconsistent: "1080", "1080p", "HD", "SD".
 * Only bare numbers get the "p" suffix, so labels never read "1080pp" or "HDp".
 */
export function formatQuality(subname) {
  if (!subname) return null
  const value = String(subname).trim()
  if (/^\d+$/.test(value)) return `${value}p`
  if (/^\d+p$/i.test(value)) return value.toLowerCase()
  return value
}

/** "3:33" | "1:02:03" | 213 -> seconds. Returns null when unparseable. */
export function parseDuration(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  if (!text) return null
  const parts = text.split(':').map((n) => parseInt(n, 10))
  if (parts.some(Number.isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? null
}

/** Seconds -> "3:33". */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return null
  const total = Math.floor(Number(seconds))
  if (total <= 0) return null
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatCount(n) {
  if (!n) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatBytes(bytes) {
  if (!bytes || Number.isNaN(Number(bytes))) return null
  const n = Number(bytes)
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

/** Relative time for the activity log. */
export function timeAgo(timestamp, now = Date.now()) {
  if (!timestamp) return ''
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const diff = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toISOString().slice(0, 10)
}

/**
 * A filename that survives every filesystem and the Content-Disposition header.
 * Keeps letters, digits, spaces, dots, dashes and underscores.
 */
export function safeFilename(name, fallback = 'download') {
  const cleaned = String(name ?? '')
    // Control characters are stripped on purpose: a filename is echoed into a
    // Content-Disposition header, and a raw CR/LF there is a header injection.
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

/** Loopback / link-local / RFC1918 — never proxied. */
export function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number)
    const [a, b] = parts
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }

  if (h === '::1' || h === '::' || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

/** Host must equal an entry, or be a subdomain of one. */
export function isAllowedHost(hostname, allowlist = []) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`))
}
