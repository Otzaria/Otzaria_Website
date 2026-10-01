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

  const summary = await syncEdits(client)
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

  assert.equal((await syncEdits(client)).modified, 1)
  assert.equal((await BookInfoChangeSet.findById(a.id).lean()).status, 'modified')
  await assert.rejects(submitEdit({ edit: { ...EZRA, updates: { startYear: 1090 } } }, client), BookInfoInputError)

  gh.mergePull(a.prNumber)
  assert.equal((await syncEdits(client)).merged, 1)
  assert.equal((await BookInfoChangeSet.findById(a.id).lean()).status, 'merged')
  await submitEdit({ edit: { ...EZRA, updates: { startYear: 1090 } } }, client)
  assert.equal(gh.pulls.length, 3)
})
