import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubFileUrl } from './github-link.js';

test('githubFileUrl: נתיב עברי מקודד לפי מקטעים, עם עוגן שורה כשידועה', () => {
  const base = { repo: 'Otzaria/otzaria-library', ref: 'main', path: 'ToratEmetToOtzaria/ספרים/אוצריא/חזון איש.txt' };
  const enc = 'ToratEmetToOtzaria/%D7%A1%D7%A4%D7%A8%D7%99%D7%9D/%D7%90%D7%95%D7%A6%D7%A8%D7%99%D7%90/%D7%97%D7%96%D7%95%D7%9F%20%D7%90%D7%99%D7%A9.txt';
  assert.equal(githubFileUrl({ ...base, lineIndex: 41 }), `https://github.com/Otzaria/otzaria-library/blob/main/${enc}#L42`);
  assert.equal(githubFileUrl(base), `https://github.com/Otzaria/otzaria-library/blob/main/${enc}`);
  assert.equal(githubFileUrl({ ...base, lineIndex: -1 }), `https://github.com/Otzaria/otzaria-library/blob/main/${enc}`);
  assert.equal(githubFileUrl({ ...base, path: null }), null);
});
