import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { gunzipSync } from 'node:zlib'
import { normalizeHeaderValue, installContentTypeNormalizer } from './responseCompression.js'

test('normalizeHeaderValue: מערך בן איבר אחד של Content-Type הופך למחרוזת', () => {
  assert.equal(normalizeHeaderValue('content-type', ['application/json']), 'application/json')
  assert.equal(normalizeHeaderValue('Content-Type', ['text/plain; charset=utf-8']), 'text/plain; charset=utf-8')
})

test('normalizeHeaderValue: כותרות אחרות וערכים אחרים נשארים כמות שהם', () => {
  const vary = ['rsc', 'next-router-state-tree']
  assert.equal(normalizeHeaderValue('vary', vary), vary)
  const cookies = ['a=1']
  assert.equal(normalizeHeaderValue('set-cookie', cookies), cookies)
  assert.equal(normalizeHeaderValue('content-type', 'application/json'), 'application/json')
  const two = ['a', 'b']
  assert.equal(normalizeHeaderValue('content-type', two), two)
})

test('installContentTypeNormalizer: אידמפוטנטי ועוטף את setHeader', () => {
  const calls = []
  const proto = {
    setHeader(name, value) {
      calls.push([name, value])
      return this
    },
  }
  assert.equal(installContentTypeNormalizer(proto), true)
  assert.equal(installContentTypeNormalizer(proto), false)
  proto.setHeader('content-type', ['application/json'])
  proto.setHeader('vary', ['rsc'])
  assert.deepEqual(calls, [
    ['content-type', 'application/json'],
    ['vary', ['rsc']],
  ])
})

// בדיקת קצה-לקצה מול ספריית compression של Next, באותה צורה שבה
// NodeNextResponse.appendHeader כותב את הכותרת (מערך) — זה הבאג שהתיקון פותר.
test('compression של Next דוחס JSON שנכתב כמערך אחרי ההתקנה', async () => {
  const { default: compression } = await import('next/dist/compiled/compression/index.js')
  installContentTypeNormalizer(http.ServerResponse.prototype)
  const compress = compression()
  const body = JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ i, name: 'x'.repeat(20) })) })
  const server = http.createServer((req, res) => {
    compress(req, res, () => {})
    res.statusCode = 200
    res.setHeader('content-type', ['application/json'])
    res.flushHeaders()
    res.write(body)
    res.end()
  })
  await new Promise((resolve) => server.listen(0, resolve))
  try {
    const { port } = server.address()
    const { headers, raw } = await new Promise((resolve, reject) => {
      http
        .get({ port, path: '/', headers: { 'accept-encoding': 'gzip' } }, (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve({ headers: res.headers, raw: Buffer.concat(chunks) }))
        })
        .on('error', reject)
    })
    assert.equal(headers['content-encoding'], 'gzip')
    assert.equal(headers['content-type'], 'application/json')
    assert.equal(gunzipSync(raw).toString(), body)
  } finally {
    server.close()
  }
})
