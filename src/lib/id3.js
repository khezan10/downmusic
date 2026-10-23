/**
 * ID3v2.3 tags for the MP3 we encode in the browser.
 *
 * lamejs writes raw frames: title, artist, album and cover are lost, so the file
 * shows up as "Unknown artist" everywhere and the artwork is missing. This module
 * prepends a tag block, which every player reads without touching the audio.
 *
 * Why v2.3 and not v2.4: v2.3 is what car stereos, Windows Explorer, older
 * Android players and every DJ tool accept. It has no UTF-8, so text frames are
 * UTF-16LE with a BOM — accents survive, and so does non-Latin script.
 *
 * The tag is written in front of the first frame; the MP3 stream itself is
 * untouched. A file with a tag still starts with the same `ff fb` frame once the
 * tag block is skipped, which is what the tests check.
 */

const FRAME_FLAGS = [0x00, 0x00]

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function ascii(text) {
  const value = String(text || '')
  const out = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0x7f
  return out
}

/** UTF-16LE with a BOM: the only text encoding v2.3 renders reliably. */
function utf16le(text) {
  const clean = String(text ?? '').replace(/\0/g, '')
  const out = new Uint8Array(2 + clean.length * 2)
  out[0] = 0xff
  out[1] = 0xfe
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i)
    out[2 + i * 2] = code & 0xff
    out[3 + i * 2] = (code >> 8) & 0xff
  }
  return out
}

/** Frame size in v2.3 is a plain 32-bit big-endian integer (not syncsafe). */
function frameHeader(id, size) {
  return new Uint8Array([
    id.charCodeAt(0),
    id.charCodeAt(1),
    id.charCodeAt(2),
    id.charCodeAt(3),
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    FRAME_FLAGS[0],
    FRAME_FLAGS[1],
  ])
}

function textFrame(id, value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const body = concat(Uint8Array.of(0x01), utf16le(text))
  return concat(frameHeader(id, body.length), body)
}

function pictureFrame(image) {
  if (!image?.bytes?.length) return null
  const mime = ascii(image.mime || 'image/jpeg')
  const body = concat(
    Uint8Array.of(0x00), // description encoding: ISO-8859-1
    mime,
    Uint8Array.of(0x00), // mime terminator
    Uint8Array.of(0x03), // picture type: front cover
    Uint8Array.of(0x00), // empty description, terminated
    image.bytes
  )
  return concat(frameHeader('APIC', body.length), body)
}

/** 28-bit syncsafe integer: the seven-high-bit rule every reader enforces. */
function syncsafe(size) {
  return new Uint8Array([
    (size >>> 21) & 0x7f,
    (size >>> 14) & 0x7f,
    (size >>> 7) & 0x7f,
    size & 0x7f,
  ])
}

/**
 * Build the tag block, or null when there is nothing worth writing.
 *
 * @param {object} tags
 * @param {string} [tags.title]
 * @param {string} [tags.artist]
 * @param {string} [tags.album]
 * @param {string|number} [tags.trackNumber]
 * @param {string|number} [tags.year]
 * @param {{bytes: Uint8Array, mime: string}} [tags.cover]
 * @returns {Uint8Array|null}
 */
export function buildId3Tag(tags = {}) {
  const frames = [
    textFrame('TIT2', tags.title),
    textFrame('TPE1', tags.artist),
    textFrame('TALB', tags.album),
    textFrame('TRCK', tags.trackNumber),
    textFrame('TYER', tags.year),
    pictureFrame(tags.cover),
  ].filter(Boolean)

  // Nothing about the recording: leave the file exactly as it was rather than
  // stamping it with an encoder frame and calling that a tag.
  if (frames.length === 0) return null
  frames.push(textFrame('TSSE', 'DownMusic'))

  const body = concat(...frames)
  const header = concat(
    ascii('ID3'),
    Uint8Array.of(0x03, 0x00, 0x00), // v2.3.0, no flags
    syncsafe(body.length)
  )
  return concat(header, body)
}

/** Tag a finished MP3 Blob. Returns the Blob unchanged when there is no tag. */
export function tagMp3Blob(blob, tags) {
  const tag = buildId3Tag(tags)
  if (!tag) return { blob, tagged: false }
  return { blob: new Blob([tag, blob], { type: 'audio/mpeg' }), tagged: true }
}
