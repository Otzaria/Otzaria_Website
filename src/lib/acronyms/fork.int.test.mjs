/**
 * פרסום סלי כינויים מול GitHub מדומה: PR לכל סל, בנייה מחדש אחרי מיזוג, ואי-דריסה של ענף
 * שנדחף ידנית. הרצה: npm test
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { FakeGitHub } from '../corrections/testing/fake-github.js'
import { createRepoClient } from '../dicta/github-api.js'
import { parseDump, listBooks } from './dump.js'
import { ACRONYMS_PATH, ACRONYMS_REPO, loadForkState, publishChangeSet, refreshChangeSet, resetForkCaches } from './fork.js'

const DUMP = [
  'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n',
  "INSERT INTO Books(id,title) VALUES(1,'בראשית');\n",
  "INSERT INTO Books(id,title) VALUES(2,'ברכות');\n",
  "INSERT INTO Acronyms(id,acronym) VALUES(1,'בר''');\n",
  'INSERT INTO BookAcronyms(id,book_id,acronym_id) VALUES(1,1,1);\n',
  'COMMIT;\n',
].join('')

let gh
let client

beforeEach(() => {
  resetForkCaches()
  process.env.ACRONYMS_SIGNOFF = 'Test Bot <1+bot@users.noreply.github.com>'
  gh = new FakeGitHub({ repo: ACRONYMS_REPO, branch: 'master', files: { [ACRONYMS_PATH]: DUMP } })
  client = createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl: gh.fetch })
})

const aliasesOn = (branch, title) => listBooks(parseDump(gh.readFile(branch, ACRONYMS_PATH))).find((b) => b.title === title)?.aliases

test('a change set opens its own PR with a signed-off commit', async () => {
  const res = await publishChangeSet(client, { id: 'a1', ops: [{ type: 'add', book: 'ברכות', alias: 'בר"כ' }] })
  assert.equal(res.branch, 'site/acronyms-a1')
  assert.equal(gh.pulls.length, 1)
  assert.equal(gh.pulls[0].base, 'master')
  assert.match(gh.pulls[0].title, /כינויים מהאתר: 1 שינויים ב-1 ספרים/)
  assert.ok(gh.pulls[0].body.includes('| **ברכות** | ➕ הוספה |  | `בר"כ` |'))
  assert.match(gh.commits.get(res.headSha).message, /\nSigned-off-by: Test Bot <1\+bot@users\.noreply\.github\.com>$/)
  assert.deepEqual(aliasesOn('site/acronyms-a1', 'ברכות'), ['בר"כ'])
  assert.equal(gh.readFile('master', ACRONYMS_PATH), DUMP)
})

test('after one PR merges, the other open PR is rebuilt on master without id clashes', async () => {
  const a = await publishChangeSet(client, { id: 'a', ops: [{ type: 'add', book: 'ברכות', alias: 'ברכ' }] })
  const b = await publishChangeSet(client, { id: 'b', ops: [{ type: 'add', book: 'בראשית', alias: 'ברא' }] })
  gh.mergePull(a.prNumber)

  const base = await loadForkState(client)
  const res = await refreshChangeSet(client, { ...b, id: 'b', ops: [{ type: 'add', book: 'בראשית', alias: 'ברא' }] }, base)
  assert.equal(res.status, 'rebuilt')
  assert.equal(res.baseSha, gh.headSha('master'))
  assert.deepEqual(gh.commits.get(res.headSha).parents, [gh.headSha('master')])
  const text = gh.readFile('site/acronyms-b', ACRONYMS_PATH)
  assert.match(text, /VALUES\(2,'ברכ'\);\nINSERT INTO Acronyms\(id,acronym\) VALUES\(3,'ברא'\);/)
  assert.deepEqual(aliasesOn('site/acronyms-b', 'ברכות'), ['ברכ'])
})

test('a rebuild refreshes the PR title and table against the new master', async () => {
  const ops = [{ type: 'add', book: 'ברכות', alias: 'ברכ' }, { type: 'add', book: 'בראשית', alias: 'ברא' }]
  const a = await publishChangeSet(client, { id: 'a', ops: [ops[0]] })
  const b = await publishChangeSet(client, { id: 'b', ops })
  assert.match(gh.pulls[1].title, /2 שינויים ב-2 ספרים/)
  gh.mergePull(a.prNumber)

  await refreshChangeSet(client, { ...b, id: 'b', ops }, await loadForkState(client))
  assert.match(gh.pulls[1].title, /1 שינויים ב-1 ספרים/)
  assert.match(gh.pulls[1].body, /<details><summary>1 שינויים שכבר היו במצב המבוקש/)
})

test('an up-to-date PR is left alone', async () => {
  const a = await publishChangeSet(client, { id: 'a', ops: [{ type: 'add', book: 'ברכות', alias: 'ברכ' }] })
  const res = await refreshChangeSet(client, { ...a, ops: [] }, await loadForkState(client))
  assert.equal(res.status, 'open')
})

test('a branch someone pushed to by hand is not overwritten', async () => {
  const ops = [{ type: 'add', book: 'ברכות', alias: 'ברכ' }]
  const a = await publishChangeSet(client, { id: 'a', ops })
  gh.pushExternal('site/acronyms-a', { 'README.md': 'fix' })
  gh.pushExternal('master', { 'other.txt': 'x' })
  const before = gh.headSha('site/acronyms-a')
  const res = await refreshChangeSet(client, { ...a, ops }, await loadForkState(client))
  assert.equal(res.status, 'modified')
  assert.equal(gh.headSha('site/acronyms-a'), before)
})

test('merged and closed PRs are reported as such', async () => {
  const a = await publishChangeSet(client, { id: 'a', ops: [{ type: 'add', book: 'ברכות', alias: 'ברכ' }] })
  const b = await publishChangeSet(client, { id: 'b', ops: [{ type: 'add', book: 'בראשית', alias: 'ברא' }] })
  gh.mergePull(a.prNumber)
  gh.pulls[b.prNumber - 1].state = 'closed'
  const base = await loadForkState(client)
  assert.equal((await refreshChangeSet(client, { ...a, ops: [] }, base)).status, 'merged')
  assert.equal((await refreshChangeSet(client, { ...b, ops: [] }, base)).status, 'closed')
})

test('concurrent page loads after the cache expires share one GitHub fetch', async () => {
  const { getForkSnapshot } = await import('./service.js')
  globalThis.__acronymsForkSnapshot.snapshot = null
  let calls = 0
  const counting = createRepoClient({ repo: ACRONYMS_REPO, token: 't', fetchImpl: (...a) => (calls++, gh.fetch(...a)) })
  const [a, b, c] = await Promise.all([getForkSnapshot(counting), getForkSnapshot(counting), getForkSnapshot(counting)])
  assert.equal(a, b)
  assert.equal(b, c)
  const perLoad = calls
  await getForkSnapshot(counting)
  assert.equal(calls, perLoad) // בתוך התוקף: בלי פנייה ל-GitHub
  assert.deepEqual(a.books.find((x) => x.title === 'בראשית').aliases, ["בר'"])
})

test('a 401 on the slow dump upload is retried once, and the file goes up as utf-8 text', async () => {
  let blobPosts = 0
  const timeouts = []
  const originalTimeout = AbortSignal.timeout
  AbortSignal.timeout = (ms) => {
    timeouts.push(ms)
    return originalTimeout(ms)
  }
  const flaky = createRepoClient({
    repo: ACRONYMS_REPO,
    token: 't',
    fetchImpl: async (url, init = {}) => {
      if ((init.method || 'GET') === 'POST' && String(url).endsWith('/git/blobs')) {
        blobPosts++
        assert.equal(JSON.parse(init.body).encoding, 'utf-8')
        if (blobPosts === 1) return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
      }
      return gh.fetch(url, init)
    },
  })
  try {
    const res = await publishChangeSet(flaky, { id: 'r1', ops: [{ type: 'add', book: 'ברכות', alias: 'בר"כ' }] })
    assert.equal(blobPosts, 2)
    assert.ok(timeouts.includes(120_000), `expected the dump upload to use a 120-second timeout; got ${timeouts}`)
    assert.deepEqual(aliasesOn(res.branch, 'ברכות'), ['בר"כ'])
  } finally {
    AbortSignal.timeout = originalTimeout
  }
})

test('a timed-out dump upload is retried once', async () => {
  let blobPosts = 0
  const flaky = createRepoClient({
    repo: ACRONYMS_REPO,
    token: 't',
    fetchImpl: async (url, init = {}) => {
      if ((init.method || 'GET') === 'POST' && String(url).endsWith('/git/blobs') && blobPosts++ === 0) {
        throw new DOMException('request timed out', 'TimeoutError')
      }
      return gh.fetch(url, init)
    },
  })
  const res = await publishChangeSet(flaky, { id: 'r2', ops: [{ type: 'add', book: 'ברכות', alias: 'בר"כ' }] })
  assert.equal(blobPosts, 2)
  assert.deepEqual(aliasesOn(res.branch, 'ברכות'), ['בר"כ'])
})
