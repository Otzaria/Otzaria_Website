/**
 * שליחת עריכת מידע-על-ספרים וסנכרון מול GitHub מדומה ו-Mongo אמיתי: חסימת עריכה כפולה לאותו ספר,
 * תשובה שאבדה אחרי פתיחת ה-PR, ושחרור ספר שה-PR שלו נדחף ידנית ואז מוזג.
 * הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { startMongo } from '../corrections/testing/mongo.js'
import { FakeGitHub } from '../corrections/testing/fake-github.js'
import { createRepoClient } from '../dicta/github-api.js'
import BookInfoChangeSet from '../../models/BookInfoChangeSet.js'
import { listBookInfo, parseBookInfoCsv } from './csv.js'
import { BOOK_INFO_BRANCH, BOOK_INFO_PATH, BOOK_INFO_REPO, branchName, resetBookInfoCaches } from './fork.js'
import { BookInfoInputError, getBookInfoSnapshot, submitEdit, syncEdits } from './service.js'

const CSV = [
  'bookName,authorName,generationName,subGenerationName,startYear,endYear',
  '"אבן עזרא","אברהם אבן עזרא","ראשונים","אחרוני הראשונים","1089",""',
  '"בראשית רבה","","חז""ל","אמוראים","300","500"',
  '',
].join('\n')

const EZRA = { book: 'אבן עזרא', author: 'אברהם אבן עזרא' }
const RABBA = { book: 'בראשית רבה', author: '' }

let mongo
let gh
let client

before(async () => {
  mongo = await startMongo()
})
after(async () => {
  if (!mongo.skip) await mongo.stop()
})
beforeEach(async (t) => {
  if (mongo.skip) return t.skip(mongo.skip)
  await mongo.reset()
  resetBookInfoCaches()
  globalThis.__bookInfoSnapshot.snapshot = null
  process.env.ACRONYMS_SIGNOFF = 'Test Bot <1+bot@users.noreply.github.com>'
  gh = new FakeGitHub({ repo: BOOK_INFO_REPO, branch: BOOK_INFO_BRANCH, files: { [BOOK_INFO_PATH]: CSV } })
  client = createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl: gh.fetch })
})

const rowOn = (branch, book) => listBookInfo(parseBookInfoCsv(gh.readFile(branch, BOOK_INFO_PATH))).find((r) => r.bookName === book)

test('an edit opens a PR and is recorded as open for its book', async () => {
  const res = await submitEdit({ edit: { ...EZRA, updates: { endYear: '1167' } } }, client)
  assert.equal(res.prNumber, 1)
  assert.equal(res.prUrl, gh.pulls[0].html_url)
  const doc = await BookInfoChangeSet.findOne().lean()
  assert.equal(doc.status, 'open')
  assert.equal(doc.branch, branchName(res.id))
  assert.deepEqual(doc.ops[0].changes, { endYear: 1167 })
  assert.equal(rowOn(doc.branch, 'אבן עזרא').endYear, 1167)
})

test('a second edit to a book that already has an open PR is rejected without a PR', async () => {
  await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  await assert.rejects(submitEdit({ edit: { ...EZRA, updates: { startYear: 1090 } } }, client), BookInfoInputError)
  assert.equal(gh.pulls.length, 1)
  // ספר אחר אינו חסום
  await submitEdit({ edit: { ...RABBA, updates: { startYear: 301 } } }, client)
  assert.equal(gh.pulls.length, 2)
})

test('an edit with no effect on the file is rejected without a record', async () => {
  await assert.rejects(submitEdit({ edit: { ...EZRA, updates: { startYear: 1089 } } }, client), BookInfoInputError)
  assert.equal(gh.pulls.length, 0)
  assert.equal(await BookInfoChangeSet.countDocuments(), 0)
})

test('a lost response after GitHub opened the PR still records the PR, without a second one', async () => {
  let failed = false
  const fetchImpl = async (url, init = {}) => {
    const res = await gh.fetch(url, init)
    if (!failed && (init.method || 'GET') === 'POST' && String(url).endsWith('/pulls')) {
      failed = true
      throw new Error('The operation was aborted due to timeout')
    }
    return res
  }
  const res = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl }))
  assert.equal(res.prNumber, 1)
  assert.equal(gh.pulls.length, 1)
  assert.equal((await BookInfoChangeSet.findOne().lean()).status, 'open')
})

test('sync marks a merged PR, rebuilds the other one on main, and refreshes the snapshot', async () => {
  const a = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  const b = await submitEdit({ edit: { ...RABBA, updates: { startYear: 301 } } }, client)
  assert.equal((await getBookInfoSnapshot(client)).rows.find((r) => r.bookName === 'אבן עזרא').endYear, null)
  gh.mergePull(a.prNumber)

  const summary = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(summary.merged, 1)
  assert.equal(summary.rebuilt, 1)
  const docB = await BookInfoChangeSet.findById(b.id).lean()
  assert.equal(docB.status, 'open')
  assert.equal(docB.baseSha, gh.headSha(BOOK_INFO_BRANCH))
  assert.equal(rowOn(docB.branch, 'אבן עזרא').endYear, 1167)
  assert.equal((await getBookInfoSnapshot(client)).rows.find((r) => r.bookName === 'אבן עזרא').endYear, 1167)
})

test('a PR pushed to by hand is left alone, and once merged its book can be edited again', async () => {
  const a = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  const other = await submitEdit({ edit: { ...RABBA, updates: { startYear: 301 } } }, client)
  const docA = await BookInfoChangeSet.findById(a.id).lean()
  gh.pushExternal(docA.branch, { 'README.md': 'hand edit' })
  gh.mergePull(other.prNumber)

  assert.equal((await syncEdits(client, Date.now(), { mutationDelayMs: 0 })).modified, 1)
  assert.equal((await BookInfoChangeSet.findById(a.id).lean()).status, 'modified')
  await assert.rejects(submitEdit({ edit: { ...EZRA, updates: { startYear: 1090 } } }, client), BookInfoInputError)

  gh.mergePull(a.prNumber)
  assert.equal((await syncEdits(client, Date.now(), { mutationDelayMs: 0 })).merged, 1)
  assert.equal((await BookInfoChangeSet.findById(a.id).lean()).status, 'merged')
  await submitEdit({ edit: { ...EZRA, updates: { startYear: 1090 } } }, client)
  assert.equal(gh.pulls.length, 3)
})

test('two users concurrently reserving one row create exactly one active request and PR', async () => {
  const results = await Promise.allSettled([
    submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } }, userId: '000000000000000000000001' }, client),
    submitEdit({ edit: { ...EZRA, updates: { endYear: 1168 } }, userId: '000000000000000000000002' }, client),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.ok(results.find((r) => r.status === 'rejected').reason instanceof BookInfoInputError)
  assert.equal(await BookInfoChangeSet.countDocuments(), 1)
  assert.equal(gh.pulls.length, 1)
})

test('an unrelated main commit never uploads or rebuilds the CSV', async () => {
  await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { 'README.md': 'unrelated change' })
  gh.calls = []
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.rebuilt, 0)
  assert.equal(gh.calls.filter((call) => call.method !== 'GET').length, 0)
  assert.equal(gh.calls.length, 3)
})

test('a human push during blob upload is atomically rejected rather than overwritten', async () => {
  const edit = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  let human
  gh.hooks.beforeRequest = ({ method, path }) => {
    if (!human && method === 'POST' && path.endsWith('/git/blobs')) human = gh.pushExternal(doc.branch, { 'README.md': 'human work' })
  }
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.modified, 1)
  assert.equal(gh.headSha(doc.branch), human)
  assert.equal(gh.readFile(doc.branch, 'README.md'), 'human work')
  assert.equal((await BookInfoChangeSet.findById(edit.id)).status, 'modified')
  assert.ok(gh.calls.filter((call) => call.path.includes('/git/refs/heads/')).every((call) => call.body.force === false))
})

test('lost initial pull response never trusts a later human head during recovery', async () => {
  let pushed = false
  const interrupted = createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl: async (url, init = {}) => {
    const res = await gh.fetch(url, init)
    if (!pushed && init.method === 'POST' && String(url).endsWith('/pulls')) {
      pushed = true
      gh.pushExternal(gh.pulls[0].head, { 'README.md': 'human recovery edit' })
      throw new Error('lost response')
    }
    return res
  } })
  await assert.rejects(submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, interrupted), /lost response/)
  const doc = await BookInfoChangeSet.findOne().lean()
  assert.equal(doc.status, 'modified')
  assert.notEqual(doc.pendingHeadSha, gh.headSha(doc.branch))
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(gh.readFile(doc.branch, 'README.md'), 'human recovery edit')
})

test('a ref update with a lost response remains a trusted generated commit', async () => {
  const edit = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  let lost = false
  const interrupted = createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl: async (url, init = {}) => {
    const res = await gh.fetch(url, init)
    if (!lost && init.method === 'PATCH' && String(url).includes('/git/refs/heads/')) { lost = true; throw new Error('lost ref response') }
    return res
  } })
  const result = await syncEdits(interrupted, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.rebuilt, 1)
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(doc.status, 'open')
  assert.equal(doc.headSha, gh.headSha(doc.branch))
  assert.equal(doc.pendingHeadSha, null)
})

test('a durable generated intent recovers a ref update after a worker dies before DB completion', async () => {
  const edit = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  const { loadBookInfoState, refreshChangeSet } = await import('./fork.js')
  await assert.rejects(refreshChangeSet({ ...client, updatePull: async () => { throw new Error('worker died') } }, { ...doc, id: edit.id, persistIntent: async (intent) => { await BookInfoChangeSet.updateOne({ _id: doc._id }, { $set: intent }) } }, await loadBookInfoState(client)), /worker died/)
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.modified, 0)
  const recovered = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(recovered.status, 'open')
  assert.equal(recovered.headSha, gh.headSha(doc.branch))
  assert.equal(recovered.pendingHeadSha, null)
})

test('distributed runners share a Mongo lease and cannot misidentify each other as manual pushes', async () => {
  await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  let release
  let enter
  const blocked = new Promise((resolve) => { release = resolve })
  const entered = new Promise((resolve) => { enter = resolve })
  let once = false
  gh.hooks.beforeRequest = async ({ method, path }) => {
    if (!once && method === 'GET' && /\/pulls\/1$/.test(path)) { once = true; enter(); await blocked }
  }
  const first = syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  await entered
  const second = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(second.locked, 1)
  release()
  assert.equal((await first).rebuilt, 1)
  assert.equal((await BookInfoChangeSet.findOne()).status, 'open')
})

const identityPath = 'ForDB/book_info_identity.json'
function renameMain(book, next, author = '') {
  const ledger = JSON.parse(gh.readFile(BOOK_INFO_BRANCH, identityPath) || '{"schemaVersion":1,"events":[]}')
  ledger.events.push({ id: ledger.events.length + 1, kind: 'rename', old: { bookName: book, authorName: author }, new: { bookName: next, authorName: author }, commit: gh.headSha(BOOK_INFO_BRANCH) })
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: gh.readFile(BOOK_INFO_BRANCH, BOOK_INFO_PATH).replace(`"${book}"`, `"${next}"`), [identityPath]: JSON.stringify(ledger) })
}

test('two missed CI renames preserve author edits and display/reserve the current key before cron', async () => {
  const edit = await submitEdit({ edit: { ...RABBA, updates: { authorName: 'מחבר מעודכן', startYear: 301 } } }, client)
  renameMain('בראשית רבה', 'מדרש א', '')
  renameMain('מדרש א', 'מדרש ב', '')
  globalThis.__bookInfoSnapshot.snapshot = null
  const snapshot = await getBookInfoSnapshot(client)
  const { listOpenEdits } = await import('./service.js')
  const pending = await listOpenEdits(snapshot)
  assert.equal(pending[0].bookKey, 'מדרש ב\0')
  await assert.rejects(submitEdit({ edit: { book: 'מדרש ב', author: '', updates: { endYear: 501 } } }, client), BookInfoInputError)
  const before = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(before.bookKey, 'מדרש ב\0')
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.rebuilt, 1)
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(doc.ops[0].book, 'מדרש ב')
  assert.equal(doc.ops[0].identityRevision, 2)
  assert.equal(rowOn(doc.branch, 'מדרש ב').authorName, 'מחבר מעודכן')
  assert.equal(rowOn(doc.branch, 'מדרש ב').startYear, 301)
})

test('pruned and concurrent changed rows remain explicit conflicts without PR closure or stale CSV writes', async () => {
  const edit = await submitEdit({ edit: { ...RABBA, updates: { endYear: 501 } } }, client)
  const original = await BookInfoChangeSet.findById(edit.id).lean()
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300","500"', '"600","700"') })
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.conflict, 1)
  assert.equal((await BookInfoChangeSet.findById(edit.id)).status, 'conflict')
  assert.equal(gh.headSha(original.branch), original.headSha)
  assert.equal(gh.pulls[0].state, 'open')
})

test('explicit CI removal and reused old identity do not redirect or lose proposals', async () => {
  const edit = await submitEdit({ edit: { ...RABBA, updates: { startYear: 301 } } }, client)
  renameMain('בראשית רבה', 'מדרש חדש')
  // The old key is later reused by a different row. The original pending edit follows only its own ledger history.
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: gh.readFile(BOOK_INFO_BRANCH, BOOK_INFO_PATH) + '"בראשית רבה","","חז""ל","אמוראים","400","500"\n' })
  assert.equal((await syncEdits(client, Date.now(), { mutationDelayMs: 0 })).rebuilt, 1)
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(rowOn(doc.branch, 'מדרש חדש').startYear, 301)
  assert.equal(rowOn(doc.branch, 'בראשית רבה').startYear, 400)
  const ledger = JSON.parse(gh.readFile(BOOK_INFO_BRANCH, identityPath))
  ledger.events.push({ id: 2, kind: 'remove', old: { bookName: 'מדרש חדש', authorName: '' }, reason: 'orphan', commit: gh.headSha(BOOK_INFO_BRANCH) })
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: gh.readFile(BOOK_INFO_BRANCH, BOOK_INFO_PATH).split('\n').filter((line) => !line.startsWith('"מדרש חדש"')).join('\n'), [identityPath]: JSON.stringify(ledger) })
  assert.equal((await syncEdits(client, Date.now(), { mutationDelayMs: 0 })).conflict, 1)
  const removed = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(removed.status, 'conflict')
  assert.match(removed.lastError, /הוסר/)
  assert.equal(gh.pulls[0].state, 'open')
})

test('partial legacy author transfer follows only the merged identity and retains current CSV baselines', async () => {
  const { resolveLegacyEdit } = await import('./service.js')
  const proposal = { bookInfo: { bookName: RABBA.book, authorName: '' }, createdAt: new Date(0) }
  const resolved = await resolveLegacyEdit(proposal, client)
  const edit = await submitEdit({ edit: { ...RABBA, updates: { authorName: 'שם חדש' } } }, client)
  const remainder = { ...proposal, csvIdentity: resolved.identity, identityRevision: resolved.identityRevision, expectedCsvRow: resolved.row, lastPublishedChangeSetId: edit.id }
  await assert.rejects(resolveLegacyEdit(remainder, client), /להמתין/)
  gh.mergePull(edit.prNumber)
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  const next = await resolveLegacyEdit(remainder, client)
  assert.equal(next.identity.authorName, 'שם חדש')
  const final = await submitEdit({ edit: { book: next.identity.bookName, author: next.identity.authorName, updates: { endYear: 501 } } }, client)
  assert.equal(rowOn(branchName(final.id), RABBA.book).endYear, 501)
  // Another untouched old proposal can use proof from the merged site's author event.
  assert.equal((await resolveLegacyEdit(proposal, client)).identity.authorName, 'שם חדש')
})

test('shared cache invalidation refreshes a stale independent worker before its local TTL', async () => {
  const old = await getBookInfoSnapshot(client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  globalThis.__bookInfoSnapshot.snapshot = old // another process still holds this old local snapshot
  const next = await getBookInfoSnapshot(client)
  assert.equal(next.rows.find((r) => r.bookName === RABBA.book).startYear, 301)
})

test('admin active filtering precedes history limit and cursor pages retain every older active request', async () => {
  const fs = await import('node:fs')
  const vm = await import('node:vm')
  const mongoose = (await import('mongoose')).default
  const { ACTIVE_STATUSES } = await import('./service.js')
  const source = fs.readFileSync(new URL('../../app/api/admin/book-info/change-sets/route.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace('export async function GET', 'async function GET')
  const get = vm.compileFunction(source + '\nreturn GET', ['NextResponse', 'getServerSession', 'authOptions', 'connectDB', 'BookInfoChangeSet', 'mongoose', 'ACTIVE_STATUSES', 'hasBooksAccess', 'requireAccess', 'serverError'])({ json: (body, opts) => ({ ...body, httpStatus: opts?.status || 200 }) }, async () => ({ user: { role: 'admin' } }), {}, async () => {}, BookInfoChangeSet, mongoose, ACTIVE_STATUSES, () => true, () => null, () => { throw new Error('unexpected route error') })
  await BookInfoChangeSet.create([
    { bookKey: 'old', status: 'open', ops: [{ book: 'old active' }], createdAt: new Date(0) },
    ...Array.from({ length: 200 }, (_, i) => ({ bookKey: `history-${i}`, status: 'merged', ops: [{ book: `merged-${i}` }], createdAt: new Date(i + 1) })),
  ])
  const first = await get({ url: 'https://site/api/admin/book-info/change-sets' })
  assert.deepEqual(first.rows.map((row) => row.book), ['old active'])
  await BookInfoChangeSet.create(Array.from({ length: 203 }, (_, i) => ({ bookKey: `active-${i}`, status: 'open', ops: [{ book: `active-${i}` }], createdAt: new Date(i + 1000) })))
  const page1 = await get({ url: 'https://site/api/admin/book-info/change-sets' })
  assert.equal(page1.rows.length, 200)
  assert.ok(page1.nextCursor)
  const page2 = await get({ url: `https://site/api/admin/book-info/change-sets?cursor=${page1.nextCursor}` })
  assert.equal(page2.rows.length, 4)
  assert.ok(page2.rows.some((row) => row.book === 'old active'))
  assert.equal(new Set([...page1.rows, ...page2.rows].map((row) => row.id)).size, 204)
  assert.equal((await get({ url: 'https://site/api/admin/book-info/change-sets?cursor=bad' })).httpStatus, 400)
})

test('the migration index refuses historical duplicate reservations without deleting proposals', async () => {
  const { ensureActiveReservationIndex } = await import('./service.js')
  await BookInfoChangeSet.collection.dropIndex('active_book_unique')
  try {
    await BookInfoChangeSet.create([{ bookKey: 'duplicate', status: 'open', ops: [] }, { bookKey: 'duplicate', status: 'open', ops: [] }])
    await assert.rejects(ensureActiveReservationIndex(), { code: 11000 })
    assert.equal(await BookInfoChangeSet.countDocuments(), 2)
  } finally {
    await BookInfoChangeSet.deleteMany({})
    await ensureActiveReservationIndex()
  }
})

test('a worker that loses its lease cannot publish or overwrite a newer runner state', async () => {
  const State = (await import('../../models/BookInfoSyncState.js')).default
  const edit = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"300"', '"301"') })
  let release
  let enter
  const blocked = new Promise((resolve) => { release = resolve })
  const entered = new Promise((resolve) => { enter = resolve })
  let once = false
  gh.hooks.beforeRequest = async ({ method, path }) => {
    if (!once && method === 'POST' && path.endsWith('/git/blobs')) { once = true; enter(); await blocked }
  }
  const first = syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  await entered
  await State.updateOne({ _id: 'book-info' }, { $set: { expiresAt: new Date(0) } })
  const second = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(second.rebuilt, 1)
  release()
  await assert.rejects(first, { code: 'LEASE_LOST' })
  const doc = await BookInfoChangeSet.findById(edit.id).lean()
  assert.equal(doc.status, 'open')
  assert.equal(doc.headSha, gh.headSha(doc.branch))
})

test('rate limiting stops the queue and shares Retry-After backoff across workers', async () => {
  await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  await submitEdit({ edit: { ...RABBA, updates: { endYear: 501 } } }, client)
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: CSV.replace('"1089"', '"1090"') })
  gh.hooks.beforeRequest = ({ method, path }) => {
    if (method === 'POST' && path.endsWith('/git/blobs')) return new Response(JSON.stringify({ message: 'secondary rate limit' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '120' } })
  }
  const first = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(first.checked, 1)
  assert.equal(first.failed, 1)
  gh.calls = []
  const second = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(second.checked, 0)
  assert.equal(gh.calls.length, 0)
})

test('a stale form follows a recorded title rename and never overwrites a newer touched value', async () => {
  const { loadBookInfoState } = await import('./fork.js')
  const old = await loadBookInfoState(client)
  const baseline = old.state.rows.get('בראשית רבה\0')
  renameMain('בראשית רבה', 'כותרת חדשה')
  const edit = await submitEdit({ edit: { ...RABBA, baseRow: baseline, identityRevision: 0, updates: { endYear: 501 } } }, client)
  assert.equal(rowOn(branchName(edit.id), 'כותרת חדשה').endYear, 501)
  gh.mergePull(edit.prNumber)
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  await assert.rejects(submitEdit({ edit: { ...RABBA, baseRow: baseline, identityRevision: 0, updates: { endYear: 502 } } }, client), /מאז פתיחת הטופס/)
})

test('actual Python CI CLI rename/prune output preserves both authors pending edits and exposes orphan conflict', async () => {
  const fs = await import('node:fs')
  const input = fs.readFileSync(new URL('./testing/ci-identity-fixture/input.csv', import.meta.url), 'utf8')
  const output = fs.readFileSync(new URL('./testing/ci-identity-fixture/output.csv', import.meta.url), 'utf8')
  const ledger = fs.readFileSync(new URL('./testing/ci-identity-fixture/identity.json', import.meta.url), 'utf8')
  gh = new FakeGitHub({ repo: BOOK_INFO_REPO, branch: BOOK_INFO_BRANCH, files: { [BOOK_INFO_PATH]: input } })
  client = createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl: gh.fetch })
  const rows = listBookInfo(parseBookInfoCsv(input)).filter((row) => row.bookName === 'אמת ואמונה - מנחם מנדל מקוצק' || row.bookName === 'יתום')
  const pending = []
  for (const row of rows) pending.push(await submitEdit({ edit: { book: row.bookName, author: row.authorName, updates: { authorName: row.authorName + ' מתוקן' } } }, client))
  gh.pushExternal(BOOK_INFO_BRANCH, { [BOOK_INFO_PATH]: output, [identityPath]: ledger })
  const result = await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal(result.rebuilt, 2)
  assert.equal(result.conflict, 1)
  const docs = await BookInfoChangeSet.find({ _id: { $in: pending.map((item) => item.id) } }).lean()
  assert.equal(docs.filter((doc) => doc.status === 'conflict').length, 1)
  for (const doc of docs.filter((doc) => doc.status === 'open')) {
    assert.equal(doc.ops[0].book, 'אמת ואמונה')
    const row = listBookInfo(parseBookInfoCsv(gh.readFile(doc.branch, BOOK_INFO_PATH))).find((row) => row.authorName === doc.ops[0].changes.authorName)
    assert.ok(row)
    assert.equal(row.bookName, 'אמת ואמונה')
  }
})

test('durable identity prefix refuses rewritten history after worker/cache restart', async () => {
  const edit = await submitEdit({ edit: { ...RABBA, updates: { startYear: 301 } } }, client)
  renameMain('בראשית רבה', 'מדרש חדש')
  await getBookInfoSnapshot(client)
  resetBookInfoCaches() // new worker cannot depend on the original process's memory
  globalThis.__bookInfoSnapshot.snapshot = null
  const ledger = JSON.parse(gh.readFile(BOOK_INFO_BRANCH, identityPath))
  ledger.events[0].new.bookName = 'זהות אחרת'
  gh.pushExternal(BOOK_INFO_BRANCH, { [identityPath]: JSON.stringify(ledger) })
  gh.calls = []
  await assert.rejects(syncEdits(client, Date.now(), { mutationDelayMs: 0 }), { code: 'IDENTITY_REWRITE' })
  assert.equal((await BookInfoChangeSet.findById(edit.id)).status, 'open')
  assert.equal(gh.calls.filter((call) => call.method !== 'GET').length, 0)
})

test('an older in-flight GET returns its pinned rows without rewinding a newer shared snapshot', async () => {
  gh.pushExternal(BOOK_INFO_BRANCH, { [identityPath]: JSON.stringify({ schemaVersion: 1, events: [] }) })
  const oldIdentitySha = gh.fileSha(BOOK_INFO_BRANCH, identityPath)
  let release
  let enter
  const blocked = new Promise((resolve) => { release = resolve })
  const entered = new Promise((resolve) => { enter = resolve })
  let once = false
  gh.hooks.beforeRequest = async ({ method, path }) => {
    if (!once && method === 'GET' && path.endsWith('/git/blobs/' + oldIdentitySha)) { once = true; enter(); await blocked }
  }
  const older = getBookInfoSnapshot(client)
  await entered
  renameMain('בראשית רבה', 'השם העדכני')
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  const newHead = gh.headSha(BOOK_INFO_BRANCH)
  release()
  assert.ok((await older).rows.some((row) => row.bookName === 'בראשית רבה'))
  assert.equal(globalThis.__bookInfoSnapshot.snapshot.headSha, newHead)
  assert.ok((await getBookInfoSnapshot(client)).rows.some((row) => row.bookName === 'השם העדכני'))
})

test('legacy route retains a stale author proposal when an approved author transition conflicts', async () => {
  const fs = await import('node:fs')
  const vm = await import('node:vm')
  const source = fs.readFileSync(new URL('../../app/api/admin/book-info/pending/route.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replaceAll('export async function', 'async function').replace('export const maxDuration', 'const maxDuration')
  const { BOOK_INFO_EDITABLE_FIELDS } = await import('../book-info-constants.js')
  const { getChangedFields } = await import('../book-info-utils.js')
  const proposal = { _id: 'proposal', bookInfo: { bookName: RABBA.book, authorName: '' }, changes: { authorName: 'שם שהוצע', endYear: 501 }, createdAt: new Date(0), submittedBy: null }
  const approved = await submitEdit({ edit: { ...RABBA, updates: { authorName: 'approved new author' } } }, client)
  gh.mergePull(approved.prNumber)
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  const { resolveLegacyEdit } = await import('./service.js')
  let deleted = false
  let submitted = false
  const Pending = { findById: () => ({ populate() { return this }, lean: async () => proposal }), updateOne: async () => {}, deleteOne: async () => { deleted = true } }
  const publish = vm.compileFunction(source + '\nreturn publishAsPullRequest;', ['NextResponse', 'getServerSession', 'connectDB', 'authOptions', 'BookInfo', 'BookInfoPendingChange', 'BOOK_INFO_EDITABLE_FIELDS', 'getChangedFields', 'hasBooksAccess', 'BookInfoInputError', 'resolveLegacyEdit', 'submitEdit'])({ json: (body, opts) => ({ ...body, status: opts?.status || 200 }) }, async () => {}, async () => {}, {}, {}, Pending, BOOK_INFO_EDITABLE_FIELDS, getChangedFields, () => true, BookInfoInputError, (doc) => resolveLegacyEdit(doc, client), async () => { submitted = true; throw new Error('must not submit stale author') })
  const response = await publish({ changeId: 'proposal', fields: ['authorName'] }, null)
  assert.equal(response.status, 400)
  assert.match(response.error, /authorName/)
  assert.equal(submitted, false)
  assert.equal(deleted, false)
})

test('a terminal PR at the deferred tail releases its book on demand without rebuilding other PRs', async () => {
  const target = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } } }, client)
  // Ten unrelated older entries consume this cron batch, leaving the target unchecked.
  await BookInfoChangeSet.updateOne({ _id: target.id }, { $set: { checkedAt: new Date() } })
  await BookInfoChangeSet.create(Array.from({ length: 10 }, (_, i) => ({ bookKey: 'history-' + i, ops: [], status: 'modified', prNumber: target.prNumber, createdAt: new Date(i) })))
  gh.mergePull(target.prNumber)
  await syncEdits(client, Date.now(), { mutationDelayMs: 0 })
  assert.equal((await BookInfoChangeSet.findById(target.id)).status, 'open')
  const next = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1168 } } }, client)
  assert.ok(next.prNumber)
  assert.equal((await BookInfoChangeSet.findById(target.id)).status, 'merged')
  assert.equal(gh.pulls.length, 2)
})

test('stale terminal records filling the same user quota are reconciled only when needed', async () => {
  const owner = '000000000000000000000001'
  const target = await submitEdit({ edit: { ...EZRA, updates: { endYear: 1167 } }, userId: owner }, client)
  const original = await BookInfoChangeSet.findById(target.id).lean()
  await BookInfoChangeSet.create(Array.from({ length: 19 }, (_, i) => ({ bookKey: 'quota-old-' + i + '\0' + original.ops[0].author, ops: [{ ...original.ops[0], book: 'quota-old-' + i, baseRow: { ...original.ops[0].baseRow, bookName: 'quota-old-' + i } }], status: 'modified', prNumber: target.prNumber, baseSha: original.baseSha, submittedBy: owner })))
  gh.mergePull(target.prNumber)
  const next = await submitEdit({ edit: { ...RABBA, updates: { endYear: 501 } }, userId: owner }, client)
  assert.ok(next.prNumber)
  assert.equal(await BookInfoChangeSet.countDocuments({ status: { $in: ['publishing', 'open', 'modified', 'conflict'] }, submittedBy: owner }), 1)
})
