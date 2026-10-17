import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newReplyToken, buildReplyAddress, parseReplyAddress, extractReplyText, htmlToText, isAutoReply,
  validateInboundPayload, inboundMessageBody, replyContentIds, buildInboundComment, REPLY_ABOVE_MARKER, MAX_INBOUND_MESSAGE_CHARS,
} from './inbound.js';
import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_IMAGES_TOTAL_BYTES } from './validation.js';

const TOKEN = 'a'.repeat(40);

test('טוקן וכתובת מענה: הלוך-חזור, חלק מקומי עד 64 תווים, רישיות לא משנה', () => {
  const t = newReplyToken();
  assert.match(t, /^[0-9a-f]{40}$/);
  const addr = buildReplyAddress(t, 'reply.otzaria.org');
  assert.ok(addr.split('@')[0].length <= 64);
  assert.equal(parseReplyAddress(addr), t);
  assert.equal(parseReplyAddress(addr.toUpperCase()), t);
  assert.equal(buildReplyAddress('bad', 'reply.otzaria.org'), null);
  assert.equal(buildReplyAddress(t, ''), null);
});

test('parseReplyAddress דוחה כתובות אחרות', () => {
  for (const a of ['', 'reply@reply.otzaria.org', `reply+${TOKEN}x@x.org`, `reply+${'g'.repeat(40)}@x.org`, `other+${TOKEN}@x.org`, null]) {
    assert.equal(parseReplyAddress(a), null, String(a));
  }
});

test('extractReplyText: Gmail באנגלית, כולל כותרת שבורה לשתי שורות', () => {
  const text = 'Thanks, it happens on startup.\n\nOn Mon, Oct 5, 2026 at 10:00 AM צוות אוצריא <no-reply@otzaria.org>\nwrote:\n> original';
  assert.equal(extractReplyText(text), 'Thanks, it happens on startup.');
  assert.equal(extractReplyText('Yes\r\n\r\nOn Mon, Oct 5, 2026 at 10:00 AM X <x@y.z> wrote:\r\n> q'), 'Yes');
});

test('extractReplyText: Gmail בעברית עם תווי כיווניות', () => {
  const text = 'זה קורה רק בחלון השני\n\n\u202bבתאריך יום ב׳, 5 באוק׳ 2026 ב-10:00 מאת \u202aצוות אוצריא\u202c\u200f <\u202ano-reply@otzaria.org\u202c\u200f>:\u202c\n\n> מקור';
  assert.equal(extractReplyText(text), 'זה קורה רק בחלון השני');
});

test('extractReplyText: Outlook, הודעה מקורית ושורת החיתוך שלנו', () => {
  assert.equal(extractReplyText('ok\n\nFrom: Otzaria <no-reply@otzaria.org>\nSent: Monday\nTo: me\n\nbody'), 'ok');
  assert.equal(extractReplyText('ok\n-----Original Message-----\nbody'), 'ok');
  assert.equal(extractReplyText(`התשובה שלי\n> ↑ ${REPLY_ABOVE_MARKER}\n> שאלה`), 'התשובה שלי');
  // "From:" בלי כותרות Outlook אחריו אינו ציטוט
  assert.equal(extractReplyText('From: my experience\nit crashes'), 'From: my experience\nit crashes');
});

test('extractReplyText: ציטוט בלבד או ריק — מחזיר את הכל ולא מאבד', () => {
  assert.equal(extractReplyText('> רק ציטוט'), '> רק ציטוט');
  assert.equal(extractReplyText(''), '');
  assert.equal(extractReplyText('שורה\n> ציטוט בסוף\n>'), 'שורה');
});

test('htmlToText: מסיר את ציטוט Gmail, שורות ותגיות', () => {
  const html = '<div dir="rtl">שלום<br>עולם &amp; עוד</div><style>p{}</style><div class="gmail_quote"><p>ציטוט</p></div>';
  assert.equal(htmlToText(html), 'שלום\nעולם & עוד');
});

test('isAutoReply', () => {
  assert.equal(isAutoReply({ 'auto-submitted': 'auto-replied' }), true);
  assert.equal(isAutoReply({ 'auto-submitted': 'no' }), false);
  assert.equal(isAutoReply({ precedence: 'bulk' }), true);
  assert.equal(isAutoReply({ 'x-autoreply': 'yes' }), true);
  assert.equal(isAutoReply({}), false);
});

test('validateInboundPayload: טוקן מכתובת היעד, ניקוי והגבלות', () => {
  assert.equal(validateInboundPayload(null).ok, false);
  assert.equal(validateInboundPayload({ to: 'x@y.z' }).field, 'to');
  const v = validateInboundPayload({
    to: `reply+${TOKEN}@reply.otzaria.org`, from: ' Reporter@Example.com ', subject: 'Re:   שאלה\n',
    messageId: '<m1@x>', text: 'hi', headers: { 'auto-submitted': 'no', 'x-evil': 'x' }, attachments: 2,
  });
  assert.equal(v.ok, true);
  assert.equal(v.value.token, TOKEN);
  assert.equal(v.value.from, 'reporter@example.com');
  assert.equal(v.value.subject, 'Re: שאלה');
  assert.deepEqual(v.value.headers, { 'auto-submitted': 'no' });
  assert.equal(v.value.attachments, 2);
  assert.equal(validateInboundPayload({ to: `reply+${TOKEN}@x.org`, attachments: -1 }).value.attachments, 0);
});

test('inboundMessageBody: טקסט קודם ל-HTML, חיתוך לתקרה', () => {
  assert.equal(inboundMessageBody({ text: 'טקסט', html: '<p>html</p>' }), 'טקסט');
  assert.equal(inboundMessageBody({ text: '  ', html: '<p>html</p>' }), 'html');
  assert.equal(inboundMessageBody({ text: 'x'.repeat(MAX_INBOUND_MESSAGE_CHARS + 50) }).length, MAX_INBOUND_MESSAGE_CHARS);
});

test('buildInboundComment: ציטוט, בלי מיילים ותיוגים, עם קישור לדוח', () => {
  const body = buildInboundComment({ reportId: 'r-1', message: 'כתבו לי: a@b.com\n@octocat תראה', attachments: 1 });
  assert.ok(body.startsWith('**תשובת המדווח במייל**'));
  assert.ok(body.includes('> כתבו לי: <email>'));
  assert.ok(!body.includes('a@b.com'));
  assert.ok(!body.includes('@octocat'));
  assert.ok(body.includes('צורפו למייל 1 קבצים'));
  assert.ok(body.includes('/library/admin/app-reports/r-1'));
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 3]);
const img = (buf, fileName = 'a.png') => ({ fileName, mimeType: 'image/png', data: buf.toString('base64') });

test('validateInboundPayload: תמונות PNG/JPEG נשמרות לפי הבתים; שאינה תמונה נספרת עם הקבצים', () => {
  const v = validateInboundPayload({
    to: `reply+${TOKEN}@x.org`, attachments: 1,
    images: [img(PNG, 'dir/shots/image.png'), img(JPEG, ''), img(Buffer.from('<svg/>'), 'x.png'), { data: '!!' }, 'junk'],
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.images.map((i) => [i.mimeType, i.fileName]), [['image/png', 'image.png'], ['image/jpeg', 'image-2.jpg']]);
  assert.deepEqual(v.value.images[0].buffer, PNG);
  assert.equal(v.value.attachments, 4);
});

test('validateInboundPayload: בלי images (Worker ישן) — רשימה ריקה; מעבר לתקרות לא נשמר', () => {
  const old = validateInboundPayload({ to: `reply+${TOKEN}@x.org`, attachments: 2 });
  assert.deepEqual(old.value.images, []);
  assert.equal(old.value.attachments, 2);

  const many = validateInboundPayload({ to: `reply+${TOKEN}@x.org`, images: Array.from({ length: MAX_IMAGES + 2 }, () => img(PNG)) });
  assert.equal(many.value.images.length, MAX_IMAGES);
  assert.equal(many.value.attachments, 2);

  const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
  const nearCap = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES - PNG.length)]);
  const tooBig = validateInboundPayload({ to: `reply+${TOKEN}@x.org`, images: [img(big), img(nearCap), img(nearCap), img(nearCap), img(PNG)] });
  assert.equal(tooBig.value.images.length, 3);
  assert.ok(tooBig.value.images.reduce((n, i) => n + i.buffer.length, 0) <= MAX_IMAGES_TOTAL_BYTES);
  assert.equal(tooBig.value.attachments, 2);
});

test('buildInboundComment: תמונות עם טוקן מוטמעות, בלי טוקן לא; שאר הקבצים בשורת מספר', () => {
  const body = buildInboundComment({
    reportId: 'r-1', message: 'הנה', attachments: 2,
    images: [{ publicToken: 'A'.repeat(32) }, { publicToken: undefined }],
  });
  assert.ok(body.includes(`![תמונה 1](https://otzaria.org/api/app-reports/images/${'A'.repeat(32)})`));
  assert.ok(!body.includes('תמונה 2'));
  assert.ok(body.includes('_צורפו למייל 2 קבצים נוספים — לא פורסמו._'));
  assert.ok(!buildInboundComment({ reportId: 'r-1', message: 'x' }).includes('צורפו'));
});

const inl = (buf, contentId) => ({ ...img(buf, `${contentId}.png`), inline: true, contentId });
const gmailHtml = [
  '<div dir="rtl">הנה צילום<br><img src="cid:ii_new"></div>',
  '<div class="gmail_signature"><img src="cid:ii_sig"></div>',
  '<div class="gmail_quote">On Mon, Oct 5, 2026 at 10:00 AM X &lt;x@y.z&gt; wrote:<blockquote><img src="cid:ii_old"></blockquote></div>',
].join('');

test('תמונות מוטמעות: נשמרות רק אם מוצגות בתשובה החדשה; ציטוט, חתימה ולוגו שלא מוצג — לא נשמרים ולא נספרים', () => {
  const v = validateInboundPayload({
    to: `reply+${TOKEN}@x.org`, text: 'הנה צילום', html: gmailHtml, attachments: 1,
    images: [img(JPEG, 'b.jpg'), inl(PNG, 'ii_new'), inl(PNG, 'ii_sig'), inl(PNG, 'ii_old'), inl(PNG, 'image001.png@01DA')],
  });
  assert.deepEqual(v.value.images.map((i) => i.fileName), ['b.jpg', 'ii_new.png']);
  assert.equal(v.value.attachments, 1);
});

test('תמונות מוטמעות: Content-ID עם סוגריים ו-Outlook (From:/Sent:); תשובה שכולה ציטוט — אין תמונות', () => {
  const outlook = '<p>ראה צילום</p><p><img src="cid:image001.png@01DA1234.5678"></p><div id="divRplyFwdMsg"><b>From:</b> X<br><b>Sent:</b> Monday<br><b>To:</b> me</div><div><img src="cid:image002.png@01DA1234.5678"></div>';
  assert.deepEqual([...replyContentIds(outlook)], ['image001.png@01DA1234.5678']);
  const v = validateInboundPayload({
    to: `reply+${TOKEN}@x.org`, html: outlook,
    images: [inl(PNG, '<image001.png@01DA1234.5678>'), inl(PNG, 'image002.png@01DA1234.5678')],
  });
  assert.equal(v.value.images.length, 1);
  const onlyQuote = '<div class="gmail_quote">On Mon, Oct 5, 2026 at 10:00 AM X wrote:<img src="cid:a"></div>';
  assert.equal(replyContentIds(onlyQuote).size, 0);
  assert.equal(replyContentIds('<img src="cid:a">').has('a'), true);
});

test('תמונות בלי inline/contentId (Worker קודם) — נשמרות כמו היום', () => {
  const v = validateInboundPayload({ to: `reply+${TOKEN}@x.org`, html: gmailHtml, images: [img(PNG), img(JPEG, 'b.jpg')] });
  assert.equal(v.value.images.length, 2);
});
