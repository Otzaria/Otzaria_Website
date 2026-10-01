/**
 * פרסום עריכות מידע-על-ספרים מול GitHub מדומה: PR לכל עריכה, בנייה מחדש אחרי מיזוג, ואי-דריסה של
 * ענף שנדחף ידנית. הרצה: npm test
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { FakeGitHub } from '../corrections/testing/fake-github.js'
import { createRepoClient } from '../dicta/github-api.js'
import { listBookInfo, parseBookInfoCsv } from './csv.js'
import { BOOK_INFO_BRANCH, BOOK_INFO_PATH, BOOK_INFO_REPO, loadBookInfoState, publishChangeSet, refreshChangeSet, resetBookInfoCaches } from './fork.js'

const CSV = [
  'bookName,authorName,generationName,subGenerationName,startYear,endYear',
  '"אבן עזרא","אברהם אבן עזרא","ראשונים","אחרוני הראשונים","1089",""',
  '"בראשית רבה","","חז""ל","אמוראים","300","500"',
  '',
].join('\n')

let gh
let client

beforeEach(() => {
  resetBookInfoCaches()
  process.env.ACRONYMS_SIGNOFF = 'Test Bot <1+bot@users.noreply.github.com>'
  gh = new FakeGitHub({ repo: BOOK_INFO_REPO, branch: BOOK_INFO_BRANCH, files: { [BOOK_INFO_PATH]: CSV } })
  client = createRepoClient({ repo: BOOK_INFO_REPO, token: 't', fetchImpl: gh.fetch })
})

const rowOn = (branch, book) => listBookInfo(parseBookInfoCsv(gh.readFile(branch, BOOK_INFO_PATH))).find((r) => r.bookName === book)
const edit = (book, author, changes) => [{ type: 'update', book, author, changes }]

test('an edit opens its own PR with a signed-off commit', async () => {
  const res = await publishChangeSet(client, { id: 'a1', ops: edit('אבן עזרא', 'אברהם אבן עזרא', { endYear: 1167 }) })
  assert.equal(res.branch, 'site/book-info-a1')
  assert.equal(gh.pulls.length, 1)
  assert.equal(gh.pulls[0].base, BOOK_INFO_BRANCH)
  assert.equal(gh.pulls[0].title, 'מידע על ספרים מהאתר: אבן עזרא (אברהם אבן עזרא)')
  assert.match(gh.pulls[0].body, /\| עד שנה \| — \| `1167` \|/)
  assert.match(gh.commits.get(res.headSha).message, /\nSigned-off-by: Test Bot <1\+bot@users\.noreply\.github\.com>$/)
  assert.equal(rowOn('site/book-info-a1', 'אבן עזרא').endYear, 1167)
  assert.equal(gh.readFile(BOOK_INFO_BRANCH, BOOK_INFO_PATH), CSV)
})

test('an edit that is already in the file opens no PR', async () => {
  await assert.rejects(publishChangeSet(client, { id: 'x', ops: edit('אבן עזרא', 'אברהם אבן עזרא', { startYear: 1089 }) }), { code: 'NO_EFFECT' })
  assert.equal(gh.pulls.length, 0)
})

test('after one PR merges, the other open PR is rebuilt on main', async () => {
  const a = await publishChangeSet(client, { id: 'a', ops: edit('אבן עזרא', 'אברהם אבן עזרא', { endYear: 1167 }) })
  const bOps = edit('בראשית רבה', '', { generationName: 'ראשונים', subGenerationName: 'גאונים' })
  const b = await publishChangeSet(client, { id: 'b', ops: bOps })
  gh.mergePull(a.prNumber)

  const res = await refreshChangeSet(client, { ...b, id: 'b', ops: bOps }, await loadBookInfoState(client))
  assert.equal(res.status, 'rebuilt')
  assert.equal(res.baseSha, gh.headSha(BOOK_INFO_BRANCH))
  assert.deepEqual(gh.commits.get(res.headSha).parents, [gh.headSha(BOOK_INFO_BRANCH)])
  assert.equal(rowOn('site/book-info-b', 'אבן עזרא').endYear, 1167)
  assert.equal(rowOn('site/book-info-b', 'בראשית רבה').subGenerationName, 'גאונים')
})

test('a PR whose change landed on main by another route is closed', async () => {
  const ops = edit('אבן עזרא', 'אברהם אבן עזרא', { endYear: 1167 })
  const a = await publishChangeSet(client, { id: 'a', ops })
  const b = await publishChangeSet(client, { id: 'b', ops })
  gh.mergePull(a.prNumber)
  const res = await refreshChangeSet(client, { ...b, id: 'b', ops }, await loadBookInfoState(client))
  assert.equal(res.status, 'closed')
})

test('an up-to-date PR is left alone', async () => {
  const ops = edit('אבן עזרא', 'אברהם אבן עזרא', { endYear: 1167 })
  const a = await publishChangeSet(client, { id: 'a', ops })
  assert.equal((await refreshChangeSet(client, { ...a, ops }, await loadBookInfoState(client))).status, 'open')
})

test('a branch someone pushed to by hand is not overwritten', async () => {
  const ops = edit('אבן עזרא', 'אברהם אבן עזרא', { endYear: 1167 })
  const a = await publishChangeSet(client, { id: 'a', ops })
  const other = await publishChangeSet(client, { id: 'o', ops: edit('בראשית רבה', '', { startYear: 301 }) })
  gh.mergePull(other.prNumber)
  // headSha ששמרנו שונה ממה שבענף בפועל — כאילו מישהו דחף אליו קומיט
  const res = await refreshChangeSet(client, { ...a, headSha: 'not-the-branch-head', ops }, await loadBookInfoState(client))
  assert.equal(res.status, 'modified')
})
