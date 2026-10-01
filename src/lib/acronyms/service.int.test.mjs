/**
 * שליחת סל וסנכרון מול GitHub מדומה ו-Mongo אמיתי: כשל עמום בפרסום, וסל שאין בו שינוי אפקטיבי.
 * הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startMongo } from '../corrections/testing/mongo.js'
import { FakeGitHub } from '../corrections/testing/fake-github.js'
import { createRepoClient } from '../dicta/github-api.js'
import AcronymChangeSet from '../../models/AcronymChangeSet.js'
import { ACRONYMS_PATH, ACRONYMS_REPO, resetForkCaches } from './fork.js'
import { AcronymsInputError, requestSync, submitChangeSet, syncChangeSets } from './service.js'

const DUMP = [
  'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n',
  "INSERT INTO Books(id,title) VALUES(1,'בראשית');\n",
  "INSERT INTO Books(id,title) VALUES(2,'ברכות');\n",
  "INSERT INTO Acronyms(id,acronym) VALUES(1,'בר''');\n",
  'INSERT INTO BookAcronyms(id,book_id,acronym_id) VALUES(1,1,1);\n',
  'COMMIT;\n',
].join('')
const ADD = [{ type: 'add', book: 'ברכות', alias: 'בר"כ' }]

let mongo
let gh

before(async () => {
  mongo = await startMongo()
})
after(async () => {
  if (!mongo.skip) await mongo.stop()
})
beforeEach(async (t) => {
  if (mongo.skip) return t.skip(mongo.skip)
  await mongo.reset()
  resetForkCaches()
  process.env.ACRONYMS_SIGNOFF = 'Test Bot <1+bot@users.noreply.github.com>'
  gh = new FakeGitHub({ repo: ACRONYMS_REPO, branch: 'master', files: { [ACRONYMS_PATH]: DUMP } })
})

/** לקוח שהבקשה ה-N שתואמת ל-match נכשלת: לפני שהגיעה ל-GitHub, או אחרי שבוצעה (התשובה אבדה). */
function flakyClient(match, { afterSuccess }) {
  let failed = false
  const fetchImpl = async (url, init = {}) => {
    const hit = !failed && match(String(url), init.method || 'GET')
    if (hit && !afterSuccess) {
      failed = true
      throw new Error('network down')
    }
    const res = await gh.fetch(url, init)
    if (hit) {
      failed = true
      throw new Error('The operation was aborted due to timeout')
    }
    return res
  }
  return createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl })
}

test('a change set whose every op is already on master is rejected without a PR', async () => {
  const client = createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl: gh.fetch })
  await assert.rejects(submitChangeSet({ rawOps: [{ type: 'add', book: 'בראשית', alias: "בר'" }] }, client), AcronymsInputError)
  assert.equal(gh.pulls.length, 0)
  assert.equal(await AcronymChangeSet.countDocuments(), 0)
})

test('a lost response after GitHub opened the PR still records the PR, without a second one', async () => {
  const client = flakyClient((url, method) => method === 'POST' && url.endsWith('/pulls'), { afterSuccess: true })
  const res = await submitChangeSet({ rawOps: ADD }, client)
  assert.equal(res.prNumber, 1)
  assert.equal(gh.pulls.length, 1)
  const doc = await AcronymChangeSet.findOne().lean()
  assert.equal(doc.status, 'open')
  assert.equal(doc.prNumber, 1)
  assert.equal(doc.counts.add, 1)
})

test('a branch created without a PR gets its PR during recovery', async () => {
  const client = flakyClient((url, method) => method === 'POST' && url.endsWith('/pulls'), { afterSuccess: false })
  const res = await submitChangeSet({ rawOps: ADD }, client)
  assert.equal(gh.pulls.length, 1)
  assert.equal(res.prUrl, gh.pulls[0].html_url)
  assert.equal((await AcronymChangeSet.findOne().lean()).status, 'open')
})

test('a failure before anything reached GitHub is marked failed', async () => {
  const client = flakyClient((url, method) => method === 'POST' && url.endsWith('/git/blobs'), { afterSuccess: false })
  await assert.rejects(submitChangeSet({ rawOps: ADD }, client), /network down/)
  const doc = await AcronymChangeSet.findOne().lean()
  assert.equal(doc.status, 'failed')
  assert.equal(gh.pulls.length, 0)
})

test('when recovery itself fails the set stays publishing, and the cron finishes it later', async () => {
  let down = false
  const fetchImpl = async (url, init = {}) => {
    if (down) throw new Error('network down')
    const res = await gh.fetch(url, init)
    if ((init.method || 'GET') === 'POST' && String(url).endsWith('/pulls')) {
      down = true
      throw new Error('network down')
    }
    return res
  }
  // ה-PR נפתח, ומיד אחר כך הרשת נופלת: גם התשובה וגם הבדיקה אובדות
  await assert.rejects(submitChangeSet({ rawOps: ADD }, createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl })))
  assert.equal((await AcronymChangeSet.findOne().lean()).status, 'publishing')

  const client = createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl: gh.fetch })
  await syncChangeSets(client, Date.now() + 11 * 60_000)
  const doc = await AcronymChangeSet.findOne().lean()
  assert.equal(doc.status, 'open')
  assert.equal(doc.prNumber, 1)
  assert.equal(gh.pulls.length, 1)
})

test('an open PR whose changes reached master another way is closed, not rebuilt empty', async () => {
  const client = createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl: gh.fetch })
  await submitChangeSet({ rawOps: ADD }, client)
  await submitChangeSet({ rawOps: ADD }, client)
  gh.mergePull(1)
  resetForkCaches()

  const summary = await syncChangeSets(client)
  assert.equal(summary.merged, 1)
  assert.equal(summary.closed, 1)
  assert.equal(gh.pulls[1].state, 'closed')
  assert.match(gh.issueComments[0].body, /כבר נמצאים ב-`master`/)
  assert.deepEqual((await AcronymChangeSet.find().sort({ createdAt: 1 }).lean()).map((d) => d.status), ['merged', 'closed'])
})

test('syncs never overlap: calls during a run join one more round after it', async () => {
  let active = 0
  let maxActive = 0
  let rounds = 0
  const sync = async () => {
    active++
    maxActive = Math.max(maxActive, active)
    rounds++
    await new Promise((r) => setTimeout(r, 20))
    active--
    return { round: rounds }
  }
  const results = await Promise.all([requestSync(sync), requestSync(sync), requestSync(sync), requestSync(sync)])
  assert.equal(maxActive, 1)
  assert.equal(rounds, 2)
  assert.deepEqual(results.map((r) => r.round), [2, 2, 2, 2])
  assert.deepEqual(await requestSync(sync), { round: 3 })
})
