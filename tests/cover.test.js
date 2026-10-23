import assert from 'node:assert/strict'
import test from 'node:test'

import { promoteCoverUrl } from '../src/lib/cover.js'

test('a 300px oEmbed cover is promoted to the 640px tier', () => {
  const thumb = 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02baf89eb11ec7c657805d2da0'
  const big = promoteCoverUrl(thumb)
  assert.equal(big, 'https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b273baf89eb11ec7c657805d2da0')
})

test('a 64px cover is promoted too', () => {
  const small = 'https://i.scdn.co/image/ab67616d00004851abcdefabcdefabcdefabcd'
  assert.match(promoteCoverUrl(small), /ab67616d0000b273/)
})

test('playlist artwork keeps its own family', () => {
  const playlist = 'https://image-cdn-ak.spotifycdn.com/image/ab67706f00000001aabbccddeeff00112233445'
  assert.match(promoteCoverUrl(playlist), /ab67706f00000003/)
})

test('an unknown or foreign url is returned untouched', () => {
  assert.equal(promoteCoverUrl('https://example.com/cover.jpg'), 'https://example.com/cover.jpg')
  assert.equal(promoteCoverUrl(null), null)
  assert.equal(promoteCoverUrl(''), null)
})
