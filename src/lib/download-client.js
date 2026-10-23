'use client'

/**
 * Browser-side download pipeline: fetch the audio through our own proxy, then
 * transcode it to MP3 in the page.
 *
 * Why the proxy: googlevideo sends no CORS headers, so a direct browser fetch
 * of the CDN URL is impossible, and a plain `<a download>` cannot set `Range`.
 *
 * Why chunked: a serverless function response is capped (~4.5 MB on Vercel), and
 * a 5-minute track is already ~4.8 MB. Asking for 3 MB at a time keeps every
 * response under the cap; the browser reassembles the parts.
 *
 * Why the encode happens here and not on the server: a real MP3 is a transcode,
 * and a 4-minute track at 192 kbps is ~5.5 MB — again over the cap. In the
 * browser there is no cap, no server CPU cost, and the audio never leaves the
 * machine.
 */

import { chooseBitrate, decodeAudio, encodeMp3, mp3Filename } from './mp3.js'

const CHUNK_BYTES = 3 * 1024 * 1024
const MAX_BYTES = 250 * 1024 * 1024

function proxiedUrl(source, filename) {
  const params = new URLSearchParams({ url: source, filename })
  return `/api/download?${params.toString()}`
}

async function fetchChunks(source, filename, onStage) {
  const endpoint = proxiedUrl(source, filename)
  const parts = []
  let received = 0
  let total = null
  let guard = 0

  while (guard < 400) {
    guard += 1
    const end = received + CHUNK_BYTES - 1

    const res = await fetch(endpoint, {
      headers: { Range: `bytes=${received}-${end}` },
      cache: 'no-store',
    })

    if (res.status === 416) break // asked past the end
    if (!res.ok) {
      let message = `Download failed (HTTP ${res.status})`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        /* keep the status message */
      }
      throw new Error(message)
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength === 0) break

    parts.push(buffer)
    received += buffer.byteLength

    const range = res.headers.get('content-range')
    if (range && range.includes('/')) {
      const parsed = Number(range.split('/')[1])
      if (Number.isFinite(parsed) && parsed > 0) total = parsed
    } else if (!range && res.status === 200) {
      total = buffer.byteLength
    }

    if (onStage) {
      onStage({
        stage: 'fetching',
        percent: total ? Math.min(100, Math.round((received / total) * 100)) : null,
        received,
        total,
      })
    }

    if (total !== null && received >= total) break
    if (buffer.byteLength < CHUNK_BYTES) break
    if (received >= MAX_BYTES) break
  }

  if (parts.length === 0) throw new Error('The audio came back empty.')

  const merged = new Uint8Array(received)
  let offset = 0
  for (const part of parts) {
    merged.set(new Uint8Array(part), offset)
    offset += part.byteLength
  }
  return merged.buffer
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}

/**
 * Fetch `source` and save it as MP3.
 *
 * If the browser cannot decode the container, the original file is saved
 * instead and the caller is told — a working download beats a broken promise.
 *
 * @param {string} source     direct media URL from /api/resolve
 * @param {string} filename   name to save as (extension is forced to .mp3)
 * @param {{ duration?: number, onStage?: (s: {stage: string, percent: number|null}) => void }} [options]
 */
export async function downloadAsMp3(source, filename, { duration = 0, onStage } = {}) {
  const report = (stage, percent) => {
    if (onStage) onStage({ stage, percent })
  }

  report('fetching', null)
  const audioBuffer = await fetchChunks(source, filename, (s) => {
    if (onStage) onStage(s)
  })

  report('decoding', null)
  let mp3
  try {
    const decoded = await decodeAudio(audioBuffer)
    report('encoding', 0)
    mp3 = await encodeMp3(decoded, {
      bitrate: chooseBitrate(duration || decoded.duration),
      onProgress: (percent) => report('encoding', percent),
    })
  } catch (error) {
    // Decoding is the browser's job and it can refuse a container. Hand the
    // original bytes over rather than failing the download outright.
    saveBlob(new Blob([audioBuffer], { type: 'audio/mp4' }), filename)
    return { format: 'original', reason: error?.message || 'could not decode' }
  }

  saveBlob(mp3, mp3Filename(filename))
  return { format: 'mp3', bytes: mp3.size }
}
