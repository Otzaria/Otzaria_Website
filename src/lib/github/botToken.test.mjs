import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'crypto';
import { createAppJwt, createBotTokenProvider, getBotAppConfig, getGithubToken, ownerOf, resolveGithubToken } from './botToken.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const app = { appId: '123', privateKey };

function fakeGithub({ expiresInMs = 3_600_000, now = () => Date.now() } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization });
    const path = url.replace('https://api.github.com', '');
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    let m;
    if ((m = path.match(/^\/users\/([^/]+)\/installation$/))) return ok({ id: m[1] === 'Otzaria' ? 7 : 8 });
    if ((m = path.match(/^\/app\/installations\/(\d+)\/access_tokens$/))) {
      n += 1;
      return ok({ token: `ghs_${m[1]}_${n}`, expires_at: new Date(now() + expiresInMs).toISOString() });
    }
    if (path === '/app') return ok({ slug: 'otzaria-bot', name: 'Otzaria Bot' });
    if (path === '/users/otzaria-bot%5Bbot%5D') return ok({ id: 356959704 });
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };
  return { fetchImpl, calls };
}

test('JWT של ה-App חתום ב-RS256 עם iss ותוקף קצר', () => {
  const jwt = createAppJwt(app, 1_000_000_000_000);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.iss, '123');
  assert.equal(payload.exp - payload.iat, 600);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, s, 'base64url'));
});

test('ownerOf מזהה את הבעלים מכתובת API ומ-owner/repo', () => {
  assert.equal(ownerOf('https://api.github.com/repos/Otzaria/otzaria-library/git/trees/x'), 'Otzaria');
  assert.equal(ownerOf('palmoni5/otzaria-library'), 'palmoni5');
  assert.equal(ownerOf('https://api.github.com/user'), null);
});

test('טוקן התקנה נשמר לכל בעלים ומתחדש לפני שפג', async () => {
  let clock = 1_000_000_000_000;
  const gh = fakeGithub({ now: () => clock });
  const provider = createBotTokenProvider(app, { fetchImpl: gh.fetchImpl, now: () => clock });
  assert.equal(await provider('Otzaria/otzaria'), 'ghs_7_1');
  assert.equal(await provider('https://api.github.com/repos/Otzaria/otzaria-library/contents/a'), 'ghs_7_1');
  assert.equal(await provider('palmoni5/otzaria-library'), 'ghs_8_2');
  clock += 51 * 60 * 1000;
  assert.equal(await provider('Otzaria/otzaria'), 'ghs_7_3');
  assert.ok(gh.calls.every((c) => c.auth.startsWith('Bearer ey')), 'בקשות ה-App נחתמות ב-JWT');
});

test('קריאות מקבילות מחכות לאותה בקשת טוקן', async () => {
  const gh = fakeGithub();
  const provider = createBotTokenProvider(app, { fetchImpl: gh.fetchImpl });
  const tokens = await Promise.all([provider('Otzaria/a'), provider('Otzaria/b'), provider('Otzaria/c')]);
  assert.deepEqual(tokens, ['ghs_7_1', 'ghs_7_1', 'ghs_7_1']);
  assert.equal(gh.calls.filter((c) => c.method === 'POST').length, 1);
});

test('כשל בהנפקה לא נשמר במטמון', async () => {
  let fail = true;
  const gh = fakeGithub();
  const fetchImpl = async (url, init) => (fail ? { ok: false, status: 500, json: async () => ({ message: 'boom' }) } : gh.fetchImpl(url, init));
  const provider = createBotTokenProvider(app, { fetchImpl });
  await assert.rejects(provider('Otzaria/a'), /500: boom/);
  fail = false;
  assert.equal(await provider('Otzaria/a'), 'ghs_7_1');
});

test('זהות הבוט לחתימות: שם ה-App וכתובת noreply של המשתמש [bot]', async () => {
  const provider = createBotTokenProvider(app, { fetchImpl: fakeGithub().fetchImpl });
  assert.equal(provider.isBot, true);
  assert.deepEqual(await provider.identity(), {
    login: 'otzaria-bot[bot]', name: 'Otzaria Bot', email: '356959704+otzaria-bot[bot]@users.noreply.github.com',
  });
});

test('getGithubToken: הבוט כשהוגדר, אחרת הטוקן האישי, אחרת null', async () => {
  const oneLineKey = privateKey.trim().replace(/\n/g, '\\n');
  assert.deepEqual(getBotAppConfig({ GITHUB_APP_ID: ' 123 ', GITHUB_APP_PRIVATE_KEY: oneLineKey }), { appId: '123', privateKey: privateKey.trim() });
  const bot = getGithubToken({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: oneLineKey, DICTA_LIBRARY_GITHUB_TOKEN: 'pat' });
  assert.equal(typeof bot, 'function');
  assert.equal(bot.isBot, true);
  assert.equal(getGithubToken({ GITHUB_APP_ID: '123', DICTA_LIBRARY_GITHUB_TOKEN: ' pat \n' }), 'pat');
  assert.equal(getGithubToken({}), null);
  assert.equal(await resolveGithubToken('pat', 'Otzaria/x'), 'pat');
});
