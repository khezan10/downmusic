/**
 * The MP3 encoder is the only part of the pipeline that produces the file the
 * user actually asked for, so it is tested rather than assumed: a silent or
 * malformed MP3 would look like a successful download.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { chooseBitrate, encodeMp3, mp3Filename } from '../src/lib/mp3.js'

/** A stand-in for the browser's AudioBuffer. */
function fakeAudioBuffer({ seconds = 1, sampleRate = 44100, channels = 2, freq = 440 } = {}) {
  const length = Math.floor(seconds * sampleRate)
  const data = []
  for (let c = 0; c < channels; c += 1) {
    const channel = new Float32Array(length)
    for (let i = 0; i < length; i += 1) {
      channel[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5
    }
    data.push(channel)
  }
  return {
    sampleRate,
    numberOfChannels: channels,
    length,
    getChannelData: (c) => data[c],
  }
}

/** MP3 frame header: 11 bits of sync, then version/layer/bitrate/samplerate. */
function parseFirstFrame(bytes) {
  for (let i = 0; i < bytes.length - 4; i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
      const b1 = bytes[i + 1]
      const b2 = bytes[i + 2]
      const version = (b1 >> 3) & 0x03
      const layer = (b1 >> 1) & 0x03
      const bitrateIndex = (b2 >> 4) & 0x0f
      const rateIndex = (b2 >> 2) & 0x03
      return { version, layer, bitrateIndex, rateIndex, offset: i }
    }
  }
  return null
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const RATES_V1 = [44100, 48000, 32000]

test('a 1-second stereo clip encodes to a real MP3 frame stream', async () => {
  const buffer = fakeAudioBuffer({ seconds: 1 })
  const blob = await encodeMp3(buffer, { bitrate: 192 })

  assert.ok(blob.size > 5000, `expected a real file, got ${blob.size} bytes`)
  assert.equal(blob.type, 'audio/mpeg')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const frame = parseFirstFrame(bytes)
  assert.ok(frame, 'no MP3 frame sync found')
  assert.equal(frame.layer, 1, 'expected layer III')
  assert.equal(frame.version, 3, 'expected MPEG-1')

  const kbps = BITRATES_V1_L3[frame.bitrateIndex]
  assert.equal(kbps, 192, `header says ${kbps} kbps`)
  assert.equal(RATES_V1[frame.rateIndex], 44100)

  // ~192 kbps for 1 s is ~24 KB; allow generous slack for the encoder ramp-up.
  assert.ok(blob.size > 12000 && blob.size < 40000, `unexpected size ${blob.size}`)
})

test('progress is reported and ends at 100', async () => {
  const seen = []
  const blob = await encodeMp3(fakeAudioBuffer({ seconds: 0.5 }), {
    bitrate: 128,
    onProgress: (pct) => seen.push(pct),
  })
  assert.ok(blob.size > 0)
  assert.ok(seen.length > 0, 'no progress reported')
  assert.equal(seen.at(-1), 100)
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    seen,
    'progress must not go backwards'
  )
})

test('a mono buffer encodes without a right channel', async () => {
  const blob = await encodeMp3(fakeAudioBuffer({ seconds: 0.5, channels: 1 }), { bitrate: 128 })
  assert.ok(blob.size > 1000)
})

test('an empty buffer is an error, not a zero-byte download', async () => {
  await assert.rejects(() => encodeMp3(fakeAudioBuffer({ seconds: 0 }), {}), /produced no output/)
})

test('filenames always come out as .mp3', () => {
  assert.equal(mp3Filename('Rick Astley - Never Gonna Give You Up.m4a'), 'Rick Astley - Never Gonna Give You Up.mp3')
  assert.equal(mp3Filename('track.webm'), 'track.mp3')
  assert.equal(mp3Filename('no-extension'), 'no-extension.mp3')
  assert.equal(mp3Filename(null), 'track.mp3')
  // The playlist rows already carry the extension — it must not double up.
  assert.equal(mp3Filename('Carly Rae Jepsen - Run Away With Me.mp3'), 'Carly Rae Jepsen - Run Away With Me.mp3')
})

test('bitrate choice stays bounded for very long tracks', () => {
  assert.equal(chooseBitrate(213), 192)
  assert.equal(chooseBitrate(0), 192)
  assert.equal(chooseBitrate(1200), 128)
})
