import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DownloadError, RELEASE_HOSTS, TARBALL_HOSTS, fetchAllowlisted, hashBody } from '../src/httpDownload.js'
import { response, sha } from './helpers.mjs'

function fakeFetch(routes, calls = []) {
  return async (url, init) => {
    calls.push({ url, headers: init.headers, redirect: init.redirect })
    const route = routes[url]
    if (!route) return response('nope', { status: 404 })
    return typeof route === 'function' ? route() : route
  }
}
const redirect = (location) => response(null, { status: 302, headers: { location } })

test('הפניה מ-github.com למארח CDN מורשה מתקבלת', async () => {
  const calls = []
  const f = fakeFetch({
    'https://github.com/o/r/releases/download/v1/setup.exe': redirect('https://release-assets.githubusercontent.com/x?sig=1'),
    'https://release-assets.githubusercontent.com/x?sig=1': response('BIN'),
  }, calls)
  const res = await fetchAllowlisted('https://github.com/o/r/releases/download/v1/setup.exe',
    { hosts: RELEASE_HOSTS, fetchImpl: f, headers: { authorization: 'secret' } })
  assert.equal(await res.text(), 'BIN')
  assert.equal(calls.every((c) => c.redirect === 'manual'), true)
  assert.equal(calls[0].headers.authorization, 'secret')
  assert.equal(calls[1].headers.authorization, undefined)
})

test('הפניה למארח זר, ל-http, או עם פורט — נחסמת', async () => {
  for (const location of ['https://evil.example/x', 'http://objects.githubusercontent.com/x', 'https://objects.githubusercontent.com:8443/x',
    'https://user:pw@objects.githubusercontent.com/x']) {
    const f = fakeFetch({ 'https://github.com/o/r/releases/download/v1/a.zip': redirect(location) })
    await assert.rejects(fetchAllowlisted('https://github.com/o/r/releases/download/v1/a.zip', { hosts: RELEASE_HOSTS, fetchImpl: f }),
      (e) => e instanceof DownloadError && /not_allowed/.test(e.code), location)
  }
  await assert.rejects(fetchAllowlisted('https://objects.githubusercontent.com/x', { hosts: RELEASE_HOSTS, fetchImpl: fakeFetch({}) }),
    (e) => e.code === 'host_not_allowed')
})

test('tarball: api.github.com → codeload בלבד; לולאת הפניות נעצרת', async () => {
  const f = fakeFetch({
    'https://api.github.com/repos/o/r/tarball/abc': redirect('https://codeload.github.com/o/r/legacy.tar.gz/abc'),
    'https://codeload.github.com/o/r/legacy.tar.gz/abc': response('TGZ'),
  })
  const res = await fetchAllowlisted('https://api.github.com/repos/o/r/tarball/abc', { hosts: TARBALL_HOSTS, fetchImpl: f })
  assert.equal(await res.text(), 'TGZ')

  const loop = fakeFetch({ 'https://api.github.com/a': () => redirect('https://api.github.com/a') })
  await assert.rejects(fetchAllowlisted('https://api.github.com/a', { hosts: TARBALL_HOSTS, fetchImpl: loop }), (e) => e.code === 'too_many_redirects')
})

test('404 → not_found; 5xx → retryable', async () => {
  await assert.rejects(fetchAllowlisted('https://github.com/x', { hosts: RELEASE_HOSTS, fetchImpl: fakeFetch({}) }), (e) => e.code === 'not_found')
  const f = fakeFetch({ 'https://github.com/x': response('', { status: 503 }) })
  await assert.rejects(fetchAllowlisted('https://github.com/x', { hosts: RELEASE_HOSTS, fetchImpl: f }), (e) => e.retryable === true)
})

test('hashBody: תקרת גודל לפי הגודל המוצהר', async () => {
  const ok = await hashBody(response('abcdef'), 6)
  assert.deepEqual(ok, { sha256: sha('abcdef'), size: 6 })
  await assert.rejects(hashBody(response('abcdefg'), 6), (e) => e.code === 'too_large')
})

test('מגבלת קצב של GitHub: המתנה מקומית עד מועד האיפוס (עד שעה) ואז ניסיון חוזר; מעבר לכך rate_limited', async () => {
  const waits = []
  const sleepImpl = async (ms) => waits.push(ms)
  const reset = Math.floor(Date.now() / 1000) + 120
  let n = 0
  const f = async () => (++n === 1
    ? response('', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } })
    : response('TGZ'))
  const res = await fetchAllowlisted('https://api.github.com/repos/o/r/tarball/abc', { hosts: TARBALL_HOSTS, fetchImpl: f, sleepImpl })
  assert.equal(await res.text(), 'TGZ')
  assert.equal(waits.length, 1)
  assert.ok(waits[0] > 100_000 && waits[0] <= 120_000)

  const far = async () => response('', { status: 429, headers: { 'retry-after': String(5 * 3600) } })
  const capped = []
  await assert.rejects(fetchAllowlisted('https://api.github.com/x', { hosts: TARBALL_HOSTS, fetchImpl: far, sleepImpl: async (ms) => capped.push(ms) }),
    (e) => e instanceof DownloadError && e.code === 'rate_limited' && e.retryable)
  assert.deepEqual(capped, [3600_000, 3600_000, 3600_000])

  const plain403 = async () => response('', { status: 403, headers: { 'x-ratelimit-remaining': '42' } })
  await assert.rejects(fetchAllowlisted('https://api.github.com/x', { hosts: TARBALL_HOSTS, fetchImpl: plain403, sleepImpl }),
    (e) => e.code === 'http_error')
})
