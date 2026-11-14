import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGithubClient, GithubError } from './github.js';

const client = (fetchImpl) => createGithubClient({ token: 'test-token', repo: 'Otzaria/otzaria', fetchImpl });
const response = (data, status = 200) => Response.json(data, { status });

test('תגובות GitHub: מרקר פענוח אחרי מאה תגובות נשמר, ו-since נשלח בכל עמוד', async () => {
  const since = '2026-11-14T12:00:00.000Z';
  const marker = '<!-- app-report-triage-report: report-1 -->';
  const comments = Array.from({ length: 201 }, (_, i) => ({
    body: i === 200 ? marker : `תגובה ${i}`, user: { login: 'maintainer' }, created_at: since,
  }));
  const pages = [];
  const github = client(async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/repos/Otzaria/otzaria/issues/100/comments');
    assert.equal(parsed.searchParams.get('since'), since);
    assert.equal(parsed.searchParams.get('per_page'), '100');
    const page = Number(parsed.searchParams.get('page') || 1);
    pages.push(page);
    return response(comments.slice((page - 1) * 100, page * 100));
  });
  const actual = await github.listComments(100, since);
  assert.deepEqual(pages, [1, 2, 3]);
  assert.equal(actual.length, 201);
  assert.deepEqual(actual.at(-1), { body: marker, author: 'maintainer', created_at: since });
});

test('תגובות GitHub: מאה תגובות בדיוק מסתיימות בעמוד המשך ריק', async () => {
  const pages = [];
  const github = client(async (url) => {
    const page = Number(new URL(url).searchParams.get('page') || 1);
    pages.push(page);
    return response(page === 1 ? Array.from({ length: 100 }, () => ({ body: 'תגובה' })) : []);
  });
  assert.equal((await github.listComments(100)).length, 100);
  assert.deepEqual(pages, [1, 2]);
});

test('תגובות GitHub: כשל או גוף שגוי בעמוד המשך אינם מחזירים רשימה חלקית', async () => {
  for (const failure of [() => response({ message: 'unavailable' }, 502), () => response({ unexpected: true })]) {
    const github = client(async (url) => {
      const page = Number(new URL(url).searchParams.get('page') || 1);
      return page === 1 ? response(Array.from({ length: 100 }, () => ({ body: 'תגובה' }))) : failure();
    });
    await assert.rejects(github.listComments(100), GithubError);
  }
});
