import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('../src/lib/upstreams.js', import.meta.url)),
  'utf8'
)

/**
 * The registry is what the site's monitor displays, so a stale or local entry is
 * published as if it were a real upstream. These guards are deliberately textual:
 * they must hold even if the module gains an import that cannot load in a bare
 * node process.
 */

test('the registry lists the whole chain, in order', () => {
  const ids = [...source.matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1])
  assert.deepEqual(ids, ['spotify-embed', 'youtube-search', 'savefrom', 'media-proxy'])
})

test('every upstream host is a public host', () => {
  const hosts = [...source.matchAll(/^\s{4}host: (.+),$/gm)].map((m) => m[1])
  assert.ok(hosts.length >= 3, 'hosts should be declared per entry')

  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.|\.local\b|::1/
  for (const host of hosts) {
    assert.ok(!local.test(host), `local host in the registry: ${host}`)
  }
})

test('the registry does not reference the developer machine', () => {
  // A path, a port on a dev server, or a hostname from someone's laptop.
  const forbidden = /localhost:3000|Users[\\/]|C:\\\\|127\.0\.0\.1:\d|\bmy-?server\b|ngrok|tunnel\.dev/i
  assert.ok(!forbidden.test(source), 'the registry mentions something local')
})

test('exactly one upstream hands over file bytes', () => {
  const serves = [...source.matchAll(/^\s{4}serves: (true|false),$/gm)].map((m) => m[1])
  assert.equal(serves.filter((v) => v === 'true').length, 1)
  assert.equal(serves.length, 4)
})

test('the media proxy probe refuses to pass when unconfigured', () => {
  // A missing NEXT_PUBLIC_MEDIA_PROXY must read as down, not as online.
  assert.match(source, /if \(!MEDIA_PROXY_URL\) throw new Error/)
})
