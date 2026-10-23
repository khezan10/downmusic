/**
 * Security-relevant helpers: the proxy guards and the limiter. These are the
 * parts where a mistake is a vulnerability rather than a bug, so they are
 * tested directly.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  _resetRateLimit,
  rateLimit,
  redirectIsSafe,
} from '../src/lib/rate-limit.js'
import { isAllowedHost, isPrivateHost } from '../src/lib/format.js'

const ALLOWLIST = ['googlevideo.com', 'sf-converter.com']

test('the limiter allows up to the limit, then refuses with Retry-After', () => {
  _resetRateLimit()
  const start = 1_000_000

  for (let i = 0; i < 5; i += 1) {
    const r = rateLimit('1.2.3.4:test', { limit: 5, windowMs: 60_000, now: start + i })
    assert.equal(r.allowed, true, `request ${i + 1} should pass`)
  }

  const blocked = rateLimit('1.2.3.4:test', { limit: 5, windowMs: 60_000, now: start + 10 })
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60)
})

test('the window slides: the bucket refills after it expires', () => {
  _resetRateLimit()
  const start = 2_000_000

  rateLimit('ip:key', { limit: 1, windowMs: 1000, now: start })
  assert.equal(rateLimit('ip:key', { limit: 1, windowMs: 1000, now: start + 10 }).allowed, false)
  // Past the window the counter starts over.
  assert.equal(rateLimit('ip:key', { limit: 1, windowMs: 1000, now: start + 1500 }).allowed, true)
})

test('limits are per key, so one abuser cannot lock out another address', () => {
  _resetRateLimit()
  const now = 3_000_000
  rateLimit('a:resolve', { limit: 1, windowMs: 60_000, now })
  assert.equal(rateLimit('a:resolve', { limit: 1, windowMs: 60_000, now }).allowed, false)
  assert.equal(rateLimit('b:resolve', { limit: 1, windowMs: 60_000, now }).allowed, true)
})

const isSafe = (url) =>
  redirectIsSafe(url, {
    allowlist: ALLOWLIST,
    isPrivate: isPrivateHost,
    isAllowed: isAllowedHost,
  })

test('a redirect may only land on an allowed public media host', () => {
  assert.equal(isSafe('https://rr3---sn-x.googlevideo.com/videoplayback?itag=140'), true)
  assert.equal(isSafe('https://media.sf-converter.com/get?uri=x'), true)

  // The SSRF cases this guard exists for.
  assert.equal(isSafe('http://169.254.169.254/latest/meta-data/'), false)
  assert.equal(isSafe('http://127.0.0.1:8080/admin'), false)
  assert.equal(isSafe('http://10.0.0.5/internal'), false)
  assert.equal(isSafe('http://[::1]/'), false)
  assert.equal(isSafe('https://evil.example.com/x.mp4'), false)
  assert.equal(isSafe('file:///etc/passwd'), false)
  assert.equal(isSafe(''), false)
  assert.equal(isSafe(null), false)
  assert.equal(isSafe('not a url'), false)
})

test('an allowed host cannot be smuggled in as a subdomain of an attacker domain', () => {
  assert.equal(isSafe('https://googlevideo.com.attacker.test/x'), false)
  assert.equal(isSafe('https://attacker.test/?u=googlevideo.com'), false)
})
