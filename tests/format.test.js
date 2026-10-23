/** Formatters and the proxy's host guards — the security-relevant bits. */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatDuration,
  formatQuality,
  formatBytes,
  isAllowedHost,
  isPrivateHost,
  maskIP,
  parseDuration,
  safeFilename,
  timeAgo,
} from '../src/lib/format.js'

test('duration parsing handles the three shapes resolvers send', () => {
  assert.equal(parseDuration('3:33'), 213)
  assert.equal(parseDuration('1:02:03'), 3723)
  assert.equal(parseDuration(213), 213)
  assert.equal(parseDuration('213'), 213)
  assert.equal(parseDuration(''), null)
  assert.equal(parseDuration('abc'), null)
  assert.equal(parseDuration(null), null)
})

test('duration formatting is symmetrical and never emits 0:00', () => {
  assert.equal(formatDuration(213), '3:33')
  assert.equal(formatDuration(3723), '1:02:03')
  assert.equal(formatDuration(9), '0:09')
  assert.equal(formatDuration(0), null)
  assert.equal(formatDuration(null), null)
})

test('quality labels never become "1080pp" or "HDp"', () => {
  assert.equal(formatQuality('1080'), '1080p')
  assert.equal(formatQuality('1080p'), '1080p')
  assert.equal(formatQuality('HD'), 'HD')
  assert.equal(formatQuality('SD'), 'SD')
  assert.equal(formatQuality(''), null)
})

test('byte formatting', () => {
  assert.equal(formatBytes(3_449_447), '3.3 MB')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(null), null)
})

test('IP masking keeps the address useless but recognisable', () => {
  assert.equal(maskIP('203.0.113.42'), '203.0.113.***')
  assert.equal(maskIP('::1'), '***.***.***.***')
  assert.equal(maskIP(undefined), '***.***.***.***')
})

test('filenames cannot escape the download folder', () => {
  assert.equal(safeFilename('Artist - Title.m4a'), 'Artist - Title.m4a')
  assert.equal(safeFilename('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(safeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j')
  assert.equal(safeFilename('   '), 'download')
  assert.equal(safeFilename(null, 'fallback'), 'fallback')
  assert.ok(safeFilename('x'.repeat(400)).length <= 120)
})

test('private hosts are refused', () => {
  const blocked = [
    'localhost',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '::1',
    'fe80::1',
    'something.internal',
    '',
  ]
  for (const host of blocked) assert.equal(isPrivateHost(host), true, host)

  const allowed = ['googlevideo.com', 'rr3---sn-5uaeznss.googlevideo.com', '1.1.1.1']
  for (const host of allowed) assert.equal(isPrivateHost(host), false, host)
})

test('allowlist matching is by host, never by substring', () => {
  const list = ['googlevideo.com', 'sf-converter.com']
  assert.equal(isAllowedHost('rr3---sn-5uaeznss.googlevideo.com', list), true)
  assert.equal(isAllowedHost('googlevideo.com', list), true)
  assert.equal(isAllowedHost('evil-googlevideo.com.attacker.test', list), false)
  assert.equal(isAllowedHost('notgooglevideo.com', list), false)
  assert.equal(isAllowedHost('googlevideo.com.evil.test', list), false)
  assert.equal(isAllowedHost('', list), false)
})

test('relative time reads like a log', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  assert.equal(timeAgo('2026-10-24T11:59:30Z', now), 'just now')
  assert.equal(timeAgo('2026-10-24T11:30:00Z', now), '30m ago')
  assert.equal(timeAgo('2026-10-24T09:00:00Z', now), '3h ago')
  assert.equal(timeAgo('2026-10-20T09:00:00Z', now), '2026-10-20')
  assert.equal(timeAgo(null, now), '')
})
