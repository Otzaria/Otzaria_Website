import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newReplyToken, buildReplyAddress, parseReplyAddress, extractReplyText, htmlToText, isAutoReply,
  validateInboundPayload, inboundMessageBody, buildInboundComment, REPLY_ABOVE_MARKER, MAX_INBOUND_MESSAGE_CHARS,
} from './inbound.js';

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
