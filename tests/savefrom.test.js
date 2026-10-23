/**
 * The converter payload is the one place where a wrong assumption silently
 * produces a broken download button, so its normalisation is tested against a
 * real payload shape (captured from a YouTube resolve, 2026-10-24).
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  describeMedia,
  isDirectMediaUrl,
  pickAudio,
  pickVideo,
  toSeconds,
  unwrapSaveFromConverter,
} from '../src/lib/savefrom.js'

const GOOGLE_AUDIO = 'https://rr3---sn-5uaeznss.googlevideo.com/videoplayback?expire=1&itag=140'
const GOOGLE_MP4_360 = 'https://rr3---sn-5uaeznss.googlevideo.com/videoplayback?expire=1&itag=18'
const GOOGLE_MP4_1080 =
  'https://rr3---sn-5uaeznss.googlevideo.com/videoplayback?expire=1&itag=137'
const CONVERTER_HTML = 'https://du.sf-converter.com/convert?payload=j79bB~QH~mnW8uLtNURAWcnzs'
const WRAPPED =
  'https://media.sf-converter.com/get?__sig=abc&uri=' +
  encodeURIComponent('https://rr3---sn-x.googlevideo.com/videoplayback?itag=140')

const payload = {
  url: [
    { ext: 'mp4', name: 'MP4', subname: '720', url: CONVERTER_HTML },
    { ext: 'mp4', name: 'MP4', subname: '480', url: CONVERTER_HTML },
    { ext: 'mp4', name: 'MP4', subname: '360', url: GOOGLE_MP4_360 },
    { ext: 'm4a', name: 'Audio M4A', subname: '131', url: GOOGLE_AUDIO },
    { ext: 'opus', name: 'Audio OPUS', subname: '137', url: GOOGLE_AUDIO },
    { ext: 'opus', name: 'Audio OPUS', subname: '49', url: GOOGLE_AUDIO },
    { ext: 'webm', name: 'WEBM', subname: '1080', url: GOOGLE_MP4_1080 },
    { ext: 'mp4', name: 'MP4', subname: '1080', url: GOOGLE_MP4_1080 },
    { ext: 'mp4', name: 'MP4', subname: '1080', url: GOOGLE_MP4_1080 },
  ],
  meta: {
    title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
    duration: '3:33',
    author: { unique_id: 'RickAstleyYT' },
  },
  thumb: WRAPPED,
  hosting: 'youtube',
}

test('only real files are treated as downloadable', () => {
  assert.equal(isDirectMediaUrl(GOOGLE_AUDIO), true)
  assert.equal(isDirectMediaUrl('https://rr3---sn-x.googlevideo.com/videoplayback'), true)
  // The converter hands out an HTML page for some entries; it is not a file.
  assert.equal(isDirectMediaUrl(CONVERTER_HTML), false)
  assert.equal(isDirectMediaUrl(WRAPPED), true)
  assert.equal(isDirectMediaUrl('https://example.test/file.mp4'), false)
  assert.equal(isDirectMediaUrl(null), false)
  assert.equal(isDirectMediaUrl(''), false)
})

test('the wrapped converter link is unwrapped to the CDN link', () => {
  assert.equal(unwrapSaveFromConverter(WRAPPED), 'https://rr3---sn-x.googlevideo.com/videoplayback?itag=140')
  assert.equal(unwrapSaveFromConverter(GOOGLE_AUDIO), GOOGLE_AUDIO)
  assert.equal(unwrapSaveFromConverter(null), null)
})

test('audio prefers m4a over opus, then the higher bitrate', () => {
  const audio = pickAudio(payload)
  assert.equal(audio.format, 'm4a')
  assert.equal(audio.url, GOOGLE_AUDIO)
  assert.equal(audio.quality, 'AAC 128 kbps')

  const opusOnly = { url: payload.url.filter((m) => m.ext === 'opus') }
  const picked = pickAudio(opusOnly)
  assert.equal(picked.format, 'opus')
  assert.equal(picked.quality, '137 kbps')
})

test('audio is null when only the HTML converter entries exist', () => {
  assert.equal(pickAudio({ url: [{ ext: 'mp4', subname: '720', url: CONVERTER_HTML }] }), null)
  assert.equal(pickAudio({ url: [] }), null)
  assert.equal(pickAudio({}), null)
  assert.equal(pickAudio(null), null)
})

test('video is the highest direct mp4, deduplicated', () => {
  const videos = pickVideo(payload)
  assert.equal(videos[0].quality, '1080p')
  assert.equal(videos[0].url, GOOGLE_MP4_1080)
  assert.equal(videos.filter((v) => v.quality === '1080p').length, 1)
  assert.equal(videos[1].quality, '360p')
  // The 720/480 entries pointed at the HTML converter and must be dropped.
  assert.equal(videos.some((v) => v.quality === '720p'), false)
})

test('metadata is described without the remaster noise', () => {
  const described = describeMedia(payload)
  assert.equal(described.title, 'Rick Astley - Never Gonna Give You Up (Official Video)')
  assert.equal(described.author, 'RickAstleyYT')
  assert.equal(described.duration, 213)
  assert.equal(described.thumbnail, 'https://rr3---sn-x.googlevideo.com/videoplayback?itag=140')
})

test('durations in every shape the converter sends', () => {
  assert.equal(toSeconds('3:33'), 213)
  assert.equal(toSeconds('1:02:03'), 3723)
  assert.equal(toSeconds('213.089'), 213)
  assert.equal(toSeconds(213), 213)
  assert.equal(toSeconds(null), null)
  assert.equal(toSeconds('n/a'), null)
})
