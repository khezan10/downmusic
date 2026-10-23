import assert from 'node:assert/strict'
import test from 'node:test'

import { buildId3Tag, tagMp3Blob } from '../src/lib/id3.js'

const strip = (bytes) => new TextDecoder('latin1').decode(bytes)

/** Read the frames back the way a player does, so the writer is checked, not trusted. */
function readFrames(tag) {
  assert.equal(strip(tag.subarray(0, 3)), 'ID3', 'must start with the ID3 marker')
  assert.equal(tag[3], 3, 'ID3v2.3')
  assert.equal(tag[4], 0)

  const size = (tag[6] << 21) | (tag[7] << 14) | (tag[8] << 7) | tag[9]
  assert.equal(size, tag.length - 10, 'syncsafe size must cover the frames exactly')

  const frames = []
  let offset = 10
  while (offset + 10 <= tag.length) {
    const id = strip(tag.subarray(offset, offset + 4))
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const frameSize =
      (tag[offset + 4] << 24) |
      (tag[offset + 5] << 16) |
      (tag[offset + 6] << 8) |
      tag[offset + 7]
    const body = tag.subarray(offset + 10, offset + 10 + frameSize)
    frames.push({ id, body })
    offset += 10 + frameSize
  }
  return frames
}

function utf16Text(body) {
  assert.equal(body[0], 1, 'text frames use UTF-16')
  assert.equal(body[1], 0xff, 'little-endian BOM')
  assert.equal(body[2], 0xfe, 'little-endian BOM')
  const decoder = new TextDecoder('utf-16le')
  return decoder.decode(body.subarray(3))
}

test('a full tag carries title, artist, album, track and encoder', () => {
  const tag = buildId3Tag({
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    album: 'Whenever You Need Somebody',
    trackNumber: 1,
    year: '1987',
  })
  const byId = Object.fromEntries(readFrames(tag).map((f) => [f.id, f.body]))

  assert.equal(utf16Text(byId.TIT2), 'Never Gonna Give You Up')
  assert.equal(utf16Text(byId.TPE1), 'Rick Astley')
  assert.equal(utf16Text(byId.TALB), 'Whenever You Need Somebody')
  assert.equal(utf16Text(byId.TRCK), '1')
  assert.equal(utf16Text(byId.TYER), '1987')
  assert.equal(utf16Text(byId.TSSE), 'DownMusic')
})

test('non-latin text survives the round trip', () => {
  const tag = buildId3Tag({ title: '夜に駆ける', artist: 'YOASOBI' })
  const byId = Object.fromEntries(readFrames(tag).map((f) => [f.id, f.body]))
  assert.equal(utf16Text(byId.TIT2), '夜に駆ける')
})

test('the cover is an APIC frame with its own mime and the original bytes', () => {
  // A tiny but real JPEG signature: the writer must not re-encode anything.
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
  const tag = buildId3Tag({ title: 'x', cover: { bytes: image, mime: 'image/jpeg' } })

  const apic = readFrames(tag).find((f) => f.id === 'APIC')
  assert.ok(apic, 'APIC frame must exist')

  const body = apic.body
  assert.equal(body[0], 0x00, 'ISO-8859-1 description encoding')
  const mimeEnd = body.indexOf(0x00, 1)
  assert.equal(strip(body.subarray(1, mimeEnd)), 'image/jpeg')
  assert.equal(body[mimeEnd + 1], 0x03, 'picture type: front cover')
  assert.equal(body[mimeEnd + 2], 0x00, 'empty description')

  const art = body.subarray(mimeEnd + 3)
  assert.deepEqual([...art], [...image], 'art bytes must be passed through unchanged')
})

test('empty input yields no tag rather than an empty one', () => {
  assert.equal(buildId3Tag({}), null)
  assert.equal(buildId3Tag({ title: '   ' }), null)
})

test('tagging a blob keeps the audio bytes untouched, in front of them', async () => {
  const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00])
  const { blob, tagged } = tagMp3Blob(new Blob([audio], { type: 'audio/mpeg' }), {
    title: 'Test',
    artist: 'Tester',
  })

  assert.equal(tagged, true)
  assert.equal(blob.type, 'audio/mpeg')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]
  assert.deepEqual([...bytes.subarray(10 + size)], [...audio], 'the stream starts right after the tag')
})

test('a blob with nothing to tag comes back unchanged', async () => {
  const audio = new Uint8Array([0xff, 0xfb])
  const blob = new Blob([audio])
  const result = tagMp3Blob(blob, {})
  assert.equal(result.tagged, false)
  assert.equal(result.blob, blob)
})
