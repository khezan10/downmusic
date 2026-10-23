/** YouTube Music search: id extraction and match scoring. */

import test from 'node:test'
import assert from 'node:assert/strict'

import { bestHit, extractVideoId, orderCandidates, parseSearchPayload, parseSubtitle } from '../src/lib/youtube.js'

/** A minimal but realistic InnerTube search payload. */
function payload() {
  const item = (title, subtitle, duration, videoId) => ({
    musicResponsiveListItemRenderer: {
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                {
                  text: title,
                  navigationEndpoint: videoId ? { watchEndpoint: { videoId } } : undefined,
                },
              ],
            },
          },
        },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: { runs: [{ text: subtitle }] },
          },
        },
      ],
      fixedColumns: [
        {
          musicResponsiveListItemFixedColumnRenderer: {
            text: { runs: [{ text: duration }] },
          },
        },
      ],
    },
  })

  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    { musicCardShelfRenderer: { title: { runs: [{ text: 'Top result' }] } } },
                    {
                      itemSectionRenderer: {
                        contents: [
                          item('Never Gonna Give You Up', 'Rick Astley • 3:33', '3:33', 'dQw4w9WgXcQ'),
                          item('Never Gonna Give You Up (Karaoke)', 'Sing King', '3:30', 'k4r40k3'),
                          item('Never Gonna Give You Up', 'Rick Astley', '3:33', undefined),
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  }
}

test('every renderer is found regardless of which section nests it', () => {
  const hits = parseSearchPayload(payload())
  assert.equal(hits.length, 2) // the third has no video id and is dropped
  assert.equal(hits[0].videoId, 'dQw4w9WgXcQ')
  assert.equal(hits[0].title, 'Never Gonna Give You Up')
  assert.equal(hits[0].duration, 213)
})

test('an empty or broken payload yields an empty list, not a throw', () => {
  assert.deepEqual(parseSearchPayload(null), [])
  assert.deepEqual(parseSearchPayload({}), [])
  assert.deepEqual(parseSearchPayload({ contents: {} }), [])
})

test('the id is read from the overlay when the title has no endpoint', () => {
  const renderer = {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Song' }] } } },
    ],
    overlay: {
      musicItemThumbnailOverlayRenderer: {
        content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { videoId: 'abc' } } } },
      },
    },
  }
  assert.equal(extractVideoId(renderer), 'abc')
})

test('bestHit prefers the official upload over a karaoke version', () => {
  const hits = parseSearchPayload(payload())
  const best = bestHit(hits, 'Never Gonna Give You Up', 'Rick Astley')
  assert.equal(best.videoId, 'dQw4w9WgXcQ')
})

test('bestHit handles an empty list and a missing artist', () => {
  assert.equal(bestHit([], 'x', 'y'), null)
  assert.equal(bestHit(null, 'x', 'y'), null)

  const hits = [{ videoId: 'z', title: 'Some Song', artist: '', duration: 1, thumbnail: '' }]
  assert.equal(bestHit(hits, 'Some Song', '')?.videoId, 'z')
})

test('a cover is not chosen over the official track', () => {
  const hits = [
    { videoId: 'cover', title: 'Blinding Lights (Cover)', artist: 'Teddy Swims', duration: 200 },
    { videoId: 'official', title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 },
  ]
  assert.equal(bestHit(hits, 'Blinding Lights', 'The Weeknd').videoId, 'official')
})

test('the runtime is read out of the subtitle, not fixedColumns', () => {
  assert.deepEqual(parseSubtitle('Song • Rick Astley'), {
    kind: 'song',
    artist: 'Rick Astley',
    duration: 0,
  })
  assert.deepEqual(parseSubtitle('Rick Astley • 6.2M views • 9:20'), {
    kind: null,
    artist: 'Rick Astley',
    duration: 560,
  })
  assert.deepEqual(parseSubtitle('Video • Olivia Rodrigo • 1.6M views'), {
    kind: 'video',
    artist: 'Olivia Rodrigo',
    duration: 0,
  })
  assert.deepEqual(parseSubtitle('Olivia Rodrigo,\u00a0Chappell Roan'), {
    kind: null,
    artist: 'Olivia Rodrigo, Chappell Roan',
    duration: 0,
  })
})

test('a long live recording loses to the studio track of the right length', () => {
  // The real regression: "Never Gonna Give You Up" (3:33 on Spotify) resolved to
  // a 9:20 Glastonbury performance because only the title was scored.
  const hits = [
    { videoId: 'glastonbury', title: 'Never Gonna Give You Up', artist: 'BBC', kind: null, duration: 560 },
    { videoId: 'studio', title: 'Never Gonna Give You Up', artist: 'Rick Astley', kind: 'song', duration: 0 },
    { videoId: 'other', title: 'Never Gonna Give You Up (Live 2016)', artist: 'KALUNGA', kind: null, duration: 307 },
  ]
  assert.equal(bestHit(hits, 'Never Gonna Give You Up', 'Rick Astley', 213).videoId, 'studio')
})

test('a duration match beats a slightly better title when the runtime is right', () => {
  const hits = [
    { videoId: 'long', title: 'Blinding Lights', artist: 'The Weeknd', kind: null, duration: 255 },
    { videoId: 'exact', title: 'Blinding Lights', artist: 'The Weeknd', kind: null, duration: 200 },
  ]
  assert.equal(bestHit(hits, 'Blinding Lights', 'The Weeknd', 200).videoId, 'exact')
})

test('uploads come before "Song" entities, songs stay as a last resort', () => {
  // Measured on the deployed function: lYBUbBu4W08 (Song) returns 3 mp4 entries
  // and no audio at all, while an upload of the same track returns m4a + opus.
  // Trying a song first therefore wastes a round trip every single time.
  const ranked = [
    { videoId: 'song1', kind: 'song', title: 'Never Gonna Give You Up' },
    { videoId: 'song2', kind: 'song', title: 'Never Gonna Give You Up' },
    { videoId: 'upload', kind: null, title: 'Never Gonna Give You Up' },
    { videoId: 'lyric', kind: 'video', title: 'Never Gonna Give You Up' },
  ]

  const ordered = orderCandidates(ranked, { limit: 3 })
  assert.deepEqual(
    ordered.map((h) => h.videoId),
    ['upload', 'lyric', 'song1']
  )
})

test('orderCandidates deduplicates and handles an empty list', () => {
  assert.deepEqual(orderCandidates([], {}), [])
  assert.deepEqual(orderCandidates(null), [])

  const withDupes = [
    { videoId: 'a', kind: 'song' },
    { videoId: 'a', kind: 'song' },
    { videoId: 'b', kind: 'video' },
  ]
  assert.deepEqual(
    orderCandidates(withDupes, { limit: 5 }).map((h) => h.videoId),
    ['b', 'a']
  )
})
