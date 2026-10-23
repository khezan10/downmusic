/**
 * MP3 encoding, in the browser.
 *
 * Why client side: the audio the converter hands out is AAC (m4a) or Opus. A
 * real MP3 has to be transcoded, and a transcoded 4-minute track at 192 kbps is
 * ~5.5 MB — over the serverless response cap. Doing it in the browser has no
 * size limit, costs nothing on the server, and the PCM never leaves the machine.
 *
 * Path: fetch bytes → `AudioContext.decodeAudioData` → `lamejs` → Blob(.mp3).
 */

import { Mp3Encoder } from '@breezystack/lamejs'

/** Decode any browser-supported audio container into raw PCM. */
export async function decodeAudio(arrayBuffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) throw new Error('This browser does not support audio decoding.')

  const ctx = new Ctx()
  try {
    // decodeAudioData detaches the buffer, so hand it a copy.
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0))
    return audio
  } finally {
    // Closing frees the hardware context immediately; Safari keeps a limited
    // number of them alive and starts failing after a few tracks without this.
    if (typeof ctx.close === 'function') ctx.close().catch(() => {})
  }
}

/** Float PCM in [-1, 1] -> Int16, the format lamejs expects. */
function toInt16(float32) {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Yield to the event loop so the page keeps painting and progress updates. */
function breathe() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Encode a decoded AudioBuffer to MP3.
 *
 * Async on purpose: lamejs is a synchronous encoder, and running it in one go
 * freezes the main thread for the whole track — no progress bar, no scrolling,
 * and in a headless tab the encoder page stops answering at all. The loop hands
 * control back every few blocks instead.
 *
 * @param {AudioBuffer} audioBuffer
 * @param {{ bitrate?: number, onProgress?: (pct:number)=>void, yieldEvery?: number }} [options]
 * @returns {Promise<Blob>}
 */
export async function encodeMp3(audioBuffer, { bitrate = 192, onProgress, yieldEvery = 10 } = {}) {
  const sampleCount = audioBuffer?.length ?? 0
  if (sampleCount === 0) {
    throw new Error('The MP3 encoder produced no output — the decoded audio was empty.')
  }

  const channels = Math.min(2, audioBuffer.numberOfChannels)
  const sampleRate = audioBuffer.sampleRate
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate)

  const left = toInt16(audioBuffer.getChannelData(0))
  const right = channels > 1 ? toInt16(audioBuffer.getChannelData(1)) : null

  // 1152 samples per MP3 granule; a bigger block keeps the loop cheap.
  const BLOCK = 1152 * 20
  const parts = []
  let encodedBytes = 0
  let block = 0

  for (let offset = 0; offset < left.length; offset += BLOCK) {
    const end = Math.min(offset + BLOCK, left.length)
    const chunk = right
      ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
      : encoder.encodeBuffer(left.subarray(offset, end))

    if (chunk.length > 0) {
      parts.push(new Uint8Array(chunk))
      encodedBytes += chunk.length
    }
    if (onProgress) onProgress(Math.round((end / left.length) * 100))

    block += 1
    if (block % yieldEvery === 0) await breathe()
  }

  const tail = encoder.flush()
  if (tail.length > 0) {
    parts.push(new Uint8Array(tail))
    encodedBytes += tail.length
  }

  if (encodedBytes === 0) throw new Error('The MP3 encoder produced no output.')

  return new Blob(parts, { type: 'audio/mpeg' })
}

/** Guess a sane bitrate for a track, keeping quality high but time bounded. */
export function chooseBitrate(seconds) {
  if (!seconds || seconds < 0) return 192
  if (seconds > 900) return 128 // a 15+ minute mix: keep the encode quick
  return 192
}

/** Name with the right extension, replacing whatever container came in. */
export function mp3Filename(name) {
  const base = String(name || 'track').replace(/\.(m4a|mp4|webm|opus|aac|ogg|mp3)$/i, '')
  return `${base}.mp3`
}
