// בדיקת עשן מקומית: node smoke.mjs — מדמה מייל נכנס, אתר ו-KV, בלי Cloudflare.
import assert from 'node:assert/strict';
import worker from './src/index.js';

const TOKEN = 'ab'.repeat(20);
const raw = [
  `From: Reporter <reporter@example.com>`,
  `To: reply+${TOKEN}@reply.otzaria.org`,
  'Subject: =?UTF-8?B?' + Buffer.from('Re: שאלה').toString('base64') + '?=',
  'Message-ID: <m1@example.com>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'זה קורה בפתיחה.',
  '',
  'On Mon, Oct 5, 2026 at 10:00 AM X <no-reply@otzaria.org> wrote:',
  '> שאלה',
].join('\r\n');

function message(to = `reply+${TOKEN}@reply.otzaria.org`) {
  const bytes = new TextEncoder().encode(raw);
  const m = {
    to, from: 'reporter@example.com', rawSize: bytes.length, forwarded: [],
    headers: new Headers({ 'message-id': '<m1@example.com>' }),
    raw: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
    forward: async (addr) => { m.forwarded.push(addr); },
  };
  return m;
}

function kv() {
  const map = new Map();
  return {
    map,
    put: async (k, v) => { map.set(k, v); },
    get: async (k, type) => (type === 'json' ? JSON.parse(map.get(k)) : map.get(k)),
    delete: async (k) => { map.delete(k); },
    list: async ({ prefix }) => ({ keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
}

const calls = [];
let siteStatus = 200;
globalThis.fetch = async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  return new Response('{}', { status: siteStatus });
};
const env = () => ({ SITE_URL: 'https://otzaria.org/', INBOUND_SECRET: 's3cret', FALLBACK_TO: 'human@otzaria.org', PENDING: kv() });

// 1. תקין
let e = env();
await worker.email(message(), e);
assert.equal(calls[0].url, 'https://otzaria.org/api/app-reports/inbound-email');
assert.equal(calls[0].init.headers.authorization, 'Bearer s3cret');
assert.equal(calls[0].body.subject, 'Re: שאלה');
assert.equal(calls[0].body.messageId, '<m1@example.com>');
assert.ok(calls[0].body.text.startsWith('זה קורה בפתיחה.'));
assert.equal(e.PENDING.map.size, 0);

// 2. שבת (503) → KV, ואחר כך ה-cron מעביר ומוחק
siteStatus = 503; e = env();
await worker.email(message(), e);
assert.equal(e.PENDING.map.size, 1);
await worker.scheduled({}, e);
assert.equal(e.PENDING.map.size, 1);
siteStatus = 200;
await worker.scheduled({}, e);
assert.equal(e.PENDING.map.size, 0);

// 3. טוקן לא מוכר (404) → העברה לתיבה רגילה
siteStatus = 404; e = env();
let m = message();
await worker.email(m, e);
assert.deepEqual(m.forwarded, ['human@otzaria.org']);

// 4. כתובת שאינה reply+ → העברה בלי לפנות לאתר
const before = calls.length;
m = message('info@reply.otzaria.org');
await worker.email(m, env());
assert.equal(calls.length, before);
assert.deepEqual(m.forwarded, ['human@otzaria.org']);

console.log('smoke ok');
