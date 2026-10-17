/**
 * תשובות המדווחים במייל: כתובת מענה ייחודית לכל דיווח (reply+<טוקן>@<דומיין>), אימות המשלוח
 * מה-Email Worker של Cloudflare, וחילוץ הטקסט החדש מתוך התשובה (בלי הציטוט של המייל המקורי).
 * טהור — בלי Mongo ובלי רשת.
 */
import crypto from 'node:crypto';
import { sanitizeUserText, reportPageUrl, publicImageUrl } from './issue-text.js';
import { decodeImage, cleanImageName, IMAGE_TYPES, MAX_IMAGES, MAX_IMAGES_TOTAL_BYTES } from './validation.js';

// hex באותיות קטנות: יש שרתי דואר שמשנים רישיות בחלק המקומי של הכתובת
export const REPLY_TOKEN_RE = /^[0-9a-f]{40}$/;
const REPLY_LOCAL_RE = /^reply\+([0-9a-f]{40})$/;

export const MAX_INBOUND_MESSAGE_CHARS = 10000;
export const MAX_INBOUND_SUBJECT_CHARS = 200;
const MAX_RAW_TEXT_CHARS = 200000;

// נשמר בגוף המייל היוצא; כל מה שמתחתיו בתשובה נחתך
export const REPLY_ABOVE_MARKER = 'אפשר להשיב מעל שורה זו';

export const newReplyToken = () => crypto.randomBytes(20).toString('hex');

export function buildReplyAddress(token, domain) {
  if (!REPLY_TOKEN_RE.test(String(token || '')) || !domain) return null;
  return `reply+${token}@${domain}`;
}

/** @returns {string|null} הטוקן מתוך כתובת היעד, או null */
export function parseReplyAddress(address) {
  const addr = String(address || '').trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at <= 0) return null;
  const m = addr.slice(0, at).match(REPLY_LOCAL_RE);
  return m ? m[1] : null;
}

const BIDI_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const stripBidi = (s) => s.replace(BIDI_RE, '');

// כותרת הציטוט של תוכנות הדואר הנפוצות (Gmail/Outlook/Apple, עברית ואנגלית)
const QUOTE_HEADER_TESTS = [
  (l) => /^On\s.{4,300}\swrote:$/.test(l),
  (l) => l.startsWith('בתאריך ') && l.endsWith(':') && (l.includes('מאת') || l.includes('כתב')),
  (l) => /^-{2,}\s*(Original Message|Forwarded message|הודעה מקורית|הודעה שהועברה)/i.test(l),
  (l) => /^_{10,}$/.test(l),
];
const OUTLOOK_FROM_RE = /^(From|מאת):\s/;
const OUTLOOK_NEXT_RE = /^(Sent|Date|To|נשלח|תאריך|אל):\s/;

function isQuoteStart(lines, i) {
  const line = stripBidi(lines[i]).trim();
  if (!line) return false;
  if (line.includes(REPLY_ABOVE_MARKER)) return true;
  if (QUOTE_HEADER_TESTS.some((t) => t(line))) return true;
  // Gmail שובר לפעמים את "On ... wrote:" לשתי שורות
  const next = stripBidi(lines[i + 1] || '').trim();
  if (next && QUOTE_HEADER_TESTS.some((t) => t(`${line} ${next}`))) return true;
  if (OUTLOOK_FROM_RE.test(line)) {
    return lines.slice(i + 1, i + 4).some((l) => OUTLOOK_NEXT_RE.test(stripBidi(l).trim()));
  }
  return false;
}

/**
 * הטקסט שהמדווח כתב, בלי הציטוט. אם החיתוך משאיר ריק — מחזיר את הטקסט כולו, כדי שלא יאבד דבר.
 */
export function extractReplyText(text) {
  const full = String(text ?? '').slice(0, MAX_RAW_TEXT_CHARS).replace(/\r\n?/g, '\n');
  const lines = full.split('\n');
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isQuoteStart(lines, i)) { end = i; break; }
  }
  const kept = lines.slice(0, end);
  const isQuoteOrBlank = (l) => { const t = l.trim(); return !t || t.startsWith('>'); };
  while (kept.length && isQuoteOrBlank(kept[kept.length - 1])) kept.pop();
  const reply = kept.join('\n').trim();
  return reply || full.trim();
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** המרה גסה ל-HTML-בלבד (כשאין חלק טקסט). הציטוט של Gmail מוסר עוד לפני ההמרה. */
export function htmlToText(html) {
  let s = String(html ?? '').slice(0, MAX_RAW_TEXT_CHARS);
  const quoteAt = s.search(/<(div|blockquote)[^>]{0,200}class="[^"]{0,100}gmail_quote/i);
  if (quoteAt >= 0) s = s.slice(0, quoteAt);
  return s
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, e) => ENTITIES[e])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CID_RE = /<img\b[^>]*?\bsrc\s*=\s*["']?cid:([^"'\s>]+)[^>]*>/gi;
const SIGNATURE_RE = /<div[^>]{0,200}(class="[^"]{0,100}gmail_signature|id="(x_)?Signature")/i;

const normalizeCid = (id) => {
  const bare = String(id ?? '').trim().replace(/^<|>$/g, '');
  try {
    return decodeURIComponent(bare);
  } catch {
    return bare;
  }
};

/**
 * ה-Content-ID של התמונות שמוצגות בחלק החדש של התשובה, לפי אותו חיתוך ציטוט של הטקסט.
 * תמונה שמופיעה רק בציטוט או בחתימה אינה נכללת.
 */
export function replyContentIds(html) {
  let s = String(html ?? '').slice(0, MAX_RAW_TEXT_CHARS);
  const sigAt = s.search(SIGNATURE_RE);
  if (sigAt >= 0) s = s.slice(0, sigAt);
  const marked = htmlToText(s.replace(CID_RE, (_, id) => ` [[cid:${encodeURIComponent(normalizeCid(id))}]] `));
  // שורה קבועה בראש: בלי טקסט חדש extractReplyText מחזיר את הכל, כולל תמונות הציטוט
  const kept = extractReplyText(`.\n${marked}`);
  return new Set([...kept.matchAll(/\[\[cid:([^\]\s]+)\]\]/g)].map((m) => decodeURIComponent(m[1])));
}

const HEADER_NAMES = ['auto-submitted', 'precedence', 'x-autoreply', 'x-autorespond', 'x-auto-response-suppress'];

/** מענה אוטומטי (מחוץ למשרד וכד') — לא נשמר ולא מתפרסם. */
export function isAutoReply(headers = {}) {
  const h = (name) => String(headers[name] ?? '').trim().toLowerCase();
  const auto = h('auto-submitted');
  if (auto && auto !== 'no') return true;
  if (h('x-autoreply') || h('x-autorespond')) return true;
  return ['bulk', 'junk', 'auto_reply'].includes(h('precedence'));
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// תמונה פגומה או מעבר לתקרות הדיווח אינה מכשילה את התשובה: היא לא נשמרת ונספרת עם שאר הקבצים.
// תמונה מוטמעת נשמרת רק אם היא מוצגת בחלק החדש של התשובה; אחרת היא מהציטוט או מהחתימה, ואינה נספרת.
function inboundImages(raw, html) {
  const images = [];
  let skipped = 0;
  let total = 0;
  let replyCids = null;
  for (const item of Array.isArray(raw) ? raw.slice(0, 100) : []) {
    if (item?.inline === true) {
      replyCids ??= replyContentIds(html);
      if (!replyCids.has(normalizeCid(item.contentId))) continue;
    }
    const { buffer, mimeType, error } = decodeImage(item);
    if (error || images.length >= MAX_IMAGES || total + buffer.length > MAX_IMAGES_TOTAL_BYTES) {
      skipped += 1;
      continue;
    }
    total += buffer.length;
    images.push({ buffer, mimeType, fileName: cleanImageName(item.fileName, images.length, IMAGE_TYPES[mimeType].ext) });
  }
  return { images, skipped };
}

/**
 * אימות גוף הבקשה מה-Worker.
 * @returns {{ok:true, value:object}|{ok:false, error:string, field:string}}
 */
export function validateInboundPayload(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be an object', field: 'body' };
  const token = parseReplyAddress(raw.to);
  if (!token) return { ok: false, error: 'to: not a reply address', field: 'to' };
  const from = str(raw.from, 320).trim().toLowerCase();
  const headers = {};
  if (raw.headers && typeof raw.headers === 'object') {
    for (const name of HEADER_NAMES) {
      if (typeof raw.headers[name] === 'string') headers[name] = raw.headers[name].slice(0, 200);
    }
  }
  // attachments = הקבצים שלא נשלחו ב-images (ה-Worker הישן שולח רק את המספר)
  const sent = Number.isInteger(raw.attachments) && raw.attachments > 0 ? raw.attachments : 0;
  const { images, skipped } = inboundImages(raw.images, str(raw.html, MAX_RAW_TEXT_CHARS));
  const attachments = Math.min(sent + skipped, 1000);
  return {
    ok: true,
    value: {
      token,
      from,
      subject: str(raw.subject, 1000).replace(/\s+/g, ' ').trim().slice(0, MAX_INBOUND_SUBJECT_CHARS),
      messageId: str(raw.messageId, 998).trim() || null,
      text: str(raw.text, MAX_RAW_TEXT_CHARS),
      html: str(raw.html, MAX_RAW_TEXT_CHARS),
      headers,
      attachments,
      images,
    },
  };
}

/** גוף ההודעה לשמירה: הטקסט החדש בלבד, חתוך לתקרה. */
export function inboundMessageBody({ text, html }) {
  const source = text && text.trim() ? text : htmlToText(html);
  return extractReplyText(source).slice(0, MAX_INBOUND_MESSAGE_CHARS);
}

/** הערה ב-issue כשהצוות שלח מייל למדווח: הנושא והתוכן, בלי כתובת המדווח. */
export function buildOutboundComment({ reportId, subject, message }) {
  const quoted = sanitizeUserText(message || '(ללא טקסט)').split('\n').map((l) => `> ${l}`).join('\n');
  return [
    '**נשלח מייל למדווח**',
    `נושא: ${sanitizeUserText(subject || '')}`,
    quoted,
    `[הדוח המלא (למפתחים)](${reportPageUrl(reportId)})`,
    `<!-- app-report-contact: ${reportId} -->`,
  ].join('\n\n');
}

/** התגובה הציבורית ב-issue: בלי כתובת מייל ובלי תיוג משתמשים; תמונות רק עם טוקן ציבורי. */
export function buildInboundComment({ reportId, message, attachments = 0, images = [] }) {
  const quoted = sanitizeUserText(message || '(ללא טקסט)').split('\n').map((l) => `> ${l}`).join('\n');
  const parts = ['**תשובת המדווח במייל**', quoted];
  const shown = images.filter((img) => img.publicToken);
  if (shown.length) parts.push(shown.map((img, i) => `![תמונה ${i + 1}](${publicImageUrl(img.publicToken)})`).join('\n\n'));
  if (attachments > 0) parts.push(`_צורפו למייל ${attachments} קבצים${shown.length ? ' נוספים' : ''} — לא פורסמו._`);
  parts.push(`[הדוח המלא (למפתחים)](${reportPageUrl(reportId)})`);
  parts.push(`<!-- app-report-reply: ${reportId} -->`);
  return parts.join('\n\n');
}
