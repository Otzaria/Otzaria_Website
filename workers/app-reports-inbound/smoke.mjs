// בדיקת עשן מקומית: node smoke.mjs — מדמה מייל נכנס, אתר ו-KV, בלי Cloudflare.
import assert from 'node:assert/strict';
import worker from './src/index.js';
// חוזה מול האתר: אותו payload עובר את האימות של האתר
import { validateInboundPayload } from '../../src/lib/app-reports/inbound.js';

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

function message(to = `reply+${TOKEN}@reply.otzaria.org`, source = raw) {
  const bytes = new TextEncoder().encode(source);
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
    put: async (k, v) => {
      if (Buffer.byteLength(v) > 25 * 1024 * 1024) throw new Error('KV value exceeds 25 MiB');
      map.set(k, v);
    },
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

// 5. תשובת Gmail: צילום שהודבק מעל הציטוט, צילום בתוך הציטוט, לוגו בחתימה, לוגו שלא מוצג,
// JPEG מצורף ו-PDF מצורף. ה-Worker שולח את מה שמוצג ב-HTML; האתר משאיר רק את מה שבתשובה החדשה.
const pngOf = (fill) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, fill)]);
const png = pngOf(7);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 9)]);
const wrap = (buf) => buf.toString('base64').replace(/.{76}/g, '$&\r\n');
const inlinePart = (cid, buf) => [
  '--rel',
  `Content-Type: image/png; name="${cid}.png"`,
  `Content-Disposition: inline; filename="${cid}.png"`,
  'Content-Transfer-Encoding: base64',
  `Content-ID: <${cid}>`,
  '',
  wrap(buf),
];
const replyHtml = [
  '<div dir="rtl">הנה צילום<br><img src="cid:ii_new" alt="image.png"></div>',
  '<div class="gmail_signature"><img src="cid:ii_sig"></div>',
  '<br><div class="gmail_quote"><div class="gmail_attr">On Mon, Oct 5, 2026 at 10:00 AM X &lt;no-reply@otzaria.org&gt; wrote:</div>',
  '<blockquote>שאלה<img src="cid:ii_old"></blockquote></div>',
].join('');
const withImages = [
  `From: Reporter <reporter@example.com>`,
  `To: reply+${TOKEN}@reply.otzaria.org`,
  'Subject: Re: images',
  'Message-ID: <m5@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="mixed"',
  '',
  '--mixed',
  'Content-Type: multipart/related; boundary="rel"',
  '',
  '--rel',
  'Content-Type: multipart/alternative; boundary="alt"',
  '',
  '--alt',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'הנה צילום',
  '[image: image.png]',
  '',
  'On Mon, Oct 5, 2026 at 10:00 AM X <no-reply@otzaria.org> wrote:',
  '> שאלה',
  '--alt',
  'Content-Type: text/html; charset=utf-8',
  '',
  replyHtml,
  '--alt--',
  ...inlinePart('ii_new', png),
  ...inlinePart('ii_sig', pngOf(1)),
  ...inlinePart('ii_old', pngOf(2)),
  ...inlinePart('image001.png@01DA', pngOf(3)),
  '--rel--',
  '--mixed',
  'Content-Type: image/jpeg; name="b.jpg"',
  'Content-Disposition: attachment; filename="b.jpg"',
  'Content-Transfer-Encoding: base64',
  '',
  wrap(jpeg),
  '--mixed',
  'Content-Type: application/pdf; name="doc.pdf"',
  'Content-Disposition: attachment; filename="doc.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('%PDF-1.4 x').toString('base64'),
  '--mixed--',
  '',
].join('\r\n');
siteStatus = 200; e = env();
await worker.email(message(undefined, withImages), e);
const sent = calls.at(-1).body;
assert.deepEqual(
  sent.images.map((i) => [i.fileName, i.inline, i.contentId]),
  [['b.jpg', false, undefined], ['ii_new.png', true, 'ii_new'], ['ii_sig.png', true, 'ii_sig'], ['ii_old.png', true, 'ii_old']],
);
assert.equal(sent.images[0].data, jpeg.toString('base64'));
assert.equal(sent.images[1].data, png.toString('base64'));
assert.equal(sent.attachments, 1);
assert.ok(sent.text.startsWith('הנה צילום'));
assert.ok(sent.html.includes('cid:ii_new'));

const site = validateInboundPayload(sent);
assert.deepEqual(site.value.images.map((i) => i.fileName), ['b.jpg', 'ii_new.png']);
assert.deepEqual(site.value.images[1].buffer, png);
assert.equal(site.value.attachments, 1);

// 6. CID is a URI: decode its escapes once, preserve the header's literal value,
// and compare the full ID (only the scheme is case-insensitive).
for (const { src, id, expected = 1 } of [
  { src: 'cid:shot%40example.com', id: 'shot@example.com' },
  { src: 'CID:Shot@example.com', id: 'Shot@example.com' },
  { src: 'CiD:shot%40example.com', id: 'shot@example.com' },
  { src: 'cid:shot%2540example.com', id: 'shot%40example.com' },
  { src: 'cid:shot@example.com.extra', id: 'shot@example.com', expected: 0 },
  { src: 'cid:shot@example.com', id: 'Shot@example.com', expected: 0 },
]) {
  const source = [
    'MIME-Version: 1.0', 'From: reporter@example.com', `To: reply+${TOKEN}@reply.otzaria.org`,
    'Subject: CID regression', 'Message-ID: <cid@example.com>',
    'Content-Type: multipart/related; boundary="rel"', '',
    '--rel', 'Content-Type: text/html; charset=utf-8', '',
    `<div>New screenshot<img src="${src}"></div>`,
    ...inlinePart(id, png), '--rel--', '',
  ].join('\r\n');
  const mail = message(undefined, source);
  await worker.email(mail, env());
  const payload = calls.at(-1).body;
  assert.equal(payload.images.length, expected, src);
  assert.equal(payload.attachments, 0, src);
  assert.deepEqual(mail.forwarded, [], src);
  const validated = validateInboundPayload(payload);
  assert.equal(validated.ok, true, src);
  assert.equal(validated.value.images.length, expected, src);
  if (expected) assert.deepEqual(validated.value.images[0].buffer, png, src);
}

// קובץ של10MiB חורג ממכסת ה־MIME הישנה של ה־Worker, אך נתמך בחוזה החדש.
const largeImage = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 - png.length)]);
const largeMail = [
  'MIME-Version: 1.0', 'From: reporter@example.com', `To: reply+${TOKEN}@reply.otzaria.org`,
  'Subject: Large screenshot', 'Message-ID: <large@example.com>',
  'Content-Type: multipart/mixed; boundary="large"', '',
  '--large', 'Content-Type: text/plain; charset=utf-8', '', 'Screenshot',
  '--large', 'Content-Type: image/png; name="large.png"',
  'Content-Disposition: attachment; filename="large.png"', 'Content-Transfer-Encoding: base64', '',
  wrap(largeImage), '--large--', '',
].join('\r\n');
const largeMessage = message(undefined, largeMail);
assert.ok(largeMessage.rawSize > 10 * 1024 * 1024);
await worker.email(largeMessage, env());
assert.deepEqual(largeMessage.forwarded, []);
const largePayload = calls.at(-1).body;
assert.equal(largePayload.images.length, 1);
assert.deepEqual(validateInboundPayload(largePayload).value.images[0].buffer, largeImage);

const overTransport = message();
overTransport.rawSize = 25 * 1024 * 1024 + 1;
const beforeOverTransport = calls.length;
await worker.email(overTransport, env());
assert.equal(calls.length, beforeOverTransport);
assert.deepEqual(overTransport.forwarded, ['human@otzaria.org']);

// MIME בינארי יכול להיכנס ל-Email Routing, אף שה-base64 שלו גדול מ-KV.
const binaryImage = 'GIF89a' + 'A'.repeat(10 * 1024 * 1024 - 6);
const binaryMail = [
  'MIME-Version: 1.0', 'From: reporter@example.com', `To: reply+${TOKEN}@reply.otzaria.org`,
  'Subject: two recordings', 'Content-Type: multipart/mixed; boundary="binary"', '',
  '--binary', 'Content-Type: text/plain; charset=utf-8', '', 'Recordings',
  ...[1, 2].flatMap((i) => ['--binary', `Content-Type: image/gif; name="${i}.gif"`,
    `Content-Disposition: attachment; filename="${i}.gif"`, 'Content-Transfer-Encoding: binary', '', binaryImage]),
  '--binary--', '',
].join('\r\n');
siteStatus = 503; e = env();
const binaryMessage = message(undefined, binaryMail);
assert.ok(binaryMessage.rawSize < 25 * 1024 * 1024);
await worker.email(binaryMessage, e);
assert.equal(calls.at(-1).body.images.length, 2);
assert.equal(calls.at(-1).body.images[0].data, Buffer.from(binaryImage).toString('base64'));
assert.ok(Buffer.byteLength(calls.at(-1).init.body) > 25 * 1024 * 1024);
assert.equal(e.PENDING.map.size, 0);
assert.deepEqual(binaryMessage.forwarded, ['human@otzaria.org']);

const kvFailure = env();
kvFailure.PENDING.put = async () => { throw new Error('KV unavailable'); };
const failedStore = message();
await worker.email(failedStore, kvFailure);
assert.deepEqual(failedStore.forwarded, ['human@otzaria.org']);
const failedForward = message();
failedForward.forward = async () => { throw new Error('Forward unavailable'); };
await assert.rejects(worker.email(failedForward, kvFailure), /Forward unavailable/);
await assert.rejects(worker.email(message(), { ...kvFailure, FALLBACK_TO: '' }), /email was not stored/);

console.log('smoke ok');
