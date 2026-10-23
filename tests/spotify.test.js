/**
 * URL parsing and normalisation — the part with the edge cases.
 * These run against the same module the API imports.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { parseSpotifyUrl, normalizeEntity, SPOTIFY_TYPES } from '../src/lib/spotify.js'

const ID = '4cOdK2wGLETKBW3PvgPWqT'

test('parses every paste form of a track link', () => {
  const forms = [
    `https://open.spotify.com/track/${ID}`,
    `https://open.spotify.com/track/${ID}?si=abc123`,
    `https://open.spotify.com/intl-id/track/${ID}`,
    `https://open.spotify.com/embed/track/${ID}`,
    `http://open.spotify.com/track/${ID}`,
    `open.spotify.com/track/${ID}`,
    `spotify:track:${ID}`,
  ]
  for (const form of forms) {
    assert.deepEqual(parseSpotifyUrl(form), { type: 'track', id: ID }, form)
  }
})

test('parses album and playlist links', () => {
  assert.deepEqual(parseSpotifyUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'), {
    type: 'album',
    id: '1DFixLWuPkv3KT3TnV35m3',
  })
  assert.deepEqual(
    parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=x').type,
    'playlist'
  )
})

test('rejects non-Spotify and malformed input', () => {
  const bad = [
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt', // artists are not supported
    'https://open.spotify.com/track/short',
    'spotify:track:not-an-id',
    'not a url at all',
    '',
    null,
    42,
  ]
  for (const value of bad) {
    assert.equal(parseSpotifyUrl(value), null, String(value))
  }
})

test('a lookalike host does not pass', () => {
  assert.equal(parseSpotifyUrl(`https://open.spotify.com.evil.test/track/${ID}`), null)
})

test('normalise a track entity', () => {
  const entity = {
    type: 'track',
    id: ID,
    name: 'Never Gonna Give You Up',
    uri: `spotify:track:${ID}`,
    artists: [{ name: 'Rick Astley' }],
    duration: 213573,
    audioPreview: { url: 'https://p.scdn.co/mp3-preview/x' },
    visualIdentity: {
      image: [
        { url: 'https://i.scdn.co/image/ab67616d00001e02aaaa' },
        { url: 'https://i.scdn.co/image/ab67616d00004851bbbb' },
        { url: 'https://i.scdn.co/image/ab67616d0000b273cccc' },
      ],
    },
  }

  const data = normalizeEntity(entity, { type: 'track', id: ID })
  assert.equal(data.kind, 'track')
  assert.equal(data.name, 'Never Gonna Give You Up')
  assert.equal(data.artist, 'Rick Astley')
  assert.equal(data.duration, 214)
  assert.equal(data.cover, 'https://i.scdn.co/image/ab67616d0000b273cccc')
  assert.equal(data.spotifyUrl, `https://open.spotify.com/track/${ID}`)
  // The 30-second preview is deliberately not part of the payload any more:
  // the app downloads the full track and never offers a preview clip.
  assert.equal(data.preview, undefined)
  assert.deepEqual(data.tracks, [])
})

test('normalise a collection entity, including the non-breaking space', () => {
  const entity = {
    type: 'playlist',
    id: 'abc',
    name: 'Today’s Top Hits',
    subtitle: 'Spotify',
    trackList: [
      {
        uri: 'spotify:track:3XmwAZpIMNpTJy8faw3ajD',
        title: 'expectations',
        subtitle: 'Olivia Rodrigo,\u00a0Chappell Roan',
        duration: 223935,
        isPlayable: true,
        audioPreview: { url: 'https://p.scdn.co/mp3-preview/y' },
      },
      { uri: 'spotify:track:70cHKK8bHAfJrOGVnfRG9J', title: 'Nicole Kidman', subtitle: 'ADÉLA' },
    ],
  }

  const data = normalizeEntity(entity, { type: 'playlist', id: 'abc' })
  assert.equal(data.kind, 'playlist')
  assert.equal(data.total, 2)
  assert.equal(data.tracks[0].artist, 'Olivia Rodrigo, Chappell Roan')
  assert.equal(data.tracks[0].duration, 224)
  assert.equal(data.tracks[0].id, '3XmwAZpIMNpTJy8faw3ajD')
  assert.equal(data.tracks[0].spotifyUrl, 'https://open.spotify.com/track/3XmwAZpIMNpTJy8faw3ajD')
  assert.equal(data.tracks[1].duration, null)
})

test('a missing entity is not silently accepted', () => {
  assert.equal(normalizeEntity(null, {}), null)
  assert.equal(normalizeEntity(undefined, {}), null)
})

test('the supported types are exactly the three the UI advertises', () => {
  assert.deepEqual(SPOTIFY_TYPES, ['track', 'album', 'playlist'])
})
