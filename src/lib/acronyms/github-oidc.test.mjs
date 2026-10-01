/** אימות אסימון OIDC של GitHub Actions, מול זוג מפתחות שנוצר בבדיקה. הרצה: npm test */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'crypto'
import { OIDC_AUDIENCE, verifyActionsToken } from './github-oidc.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const NOW = Date.UTC(2026, 9, 1)
const GOOD = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: OIDC_AUDIENCE,
  repository: 'Otzaria/SeforimAcronymizer',
  repository_id: '1133669945',
  ref: 'refs/heads/master',
  exp: NOW / 1000 + 300,
  nbf: NOW / 1000 - 10,
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(claims, { kid = 'k1', key = privateKey } = {}) {
  const head = `${b64({ alg: 'RS256', kid })}.${b64(claims)}`
  return `${head}.${sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`
}

let fetches
const fetchImpl = async () => {
  fetches++
  return new Response(JSON.stringify({ keys: [JWK] }), { status: 200 })
}
const check = (token, now = NOW) => verifyActionsToken(token, { fetchImpl, now })

beforeEach(() => {
  Object.assign(globalThis.__acronymsJwks, { at: 0, keys: [] })
  fetches = 0
})

test('a token signed by GitHub for the fork is accepted, and the keys are cached', async () => {
  assert.equal((await check(jwt(GOOD))).ok, true)
  assert.equal((await check(jwt(GOOD))).ok, true)
  assert.equal(fetches, 1)
})

test('another repo, a reused name, another audience or an expired token are rejected', async () => {
  assert.equal((await check(jwt({ ...GOOD, repository: 'evil/SeforimAcronymizer' }))).error, 'wrong repository')
  assert.equal((await check(jwt({ ...GOOD, repository_id: '42' }))).error, 'wrong repository')
  assert.equal((await check(jwt({ ...GOOD, aud: 'something-else' }))).error, 'wrong issuer or audience')
  assert.equal((await check(jwt({ ...GOOD, iss: 'https://evil.example' }))).error, 'wrong issuer or audience')
  assert.equal((await check(jwt(GOOD), NOW + 3_600_000)).error, 'expired')
})

test('a forged signature, an unknown key or garbage is rejected', async () => {
  const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  assert.equal((await check(jwt(GOOD, { key: other }))).error, 'bad signature')
  assert.equal((await check(jwt(GOOD, { kid: 'nope' }))).error, 'unknown key')
  assert.equal((await check('abc')).ok, false)
  assert.equal((await check(undefined)).ok, false)
})

test('unknown key ids do not refetch the keys more than once a minute', async () => {
  for (let i = 0; i < 5; i++) await check(jwt(GOOD, { kid: `x${i}` }))
  assert.equal(fetches, 1)
  await check(jwt(GOOD, { kid: 'x9' }), NOW + 61_000)
  assert.equal(fetches, 2)
})
