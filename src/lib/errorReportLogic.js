import crypto from 'crypto';
import { validateEmail } from './validation-utils.js';
import { computeNewLine } from './corrections/payload.js';

// לוגיקה טהורה עבור src/app/api/reportingerrors/route.js — ולידציה, נירמול,
// חישוב טביעת אצבע/נמענים ובניית תוכן המייל. לא תלוי ב-request/response של
// Next ולא מבצע קריאות רשת/DB — כל אלה נשארים בראוט עצמו.

export const REPORTING_ERRORS_RECIPIENT = 'otzaria.200@gmail.com';
export const SEFARIA_ERRORS_RECIPIENT = 'corrections@sefaria.org';
export const DEFAULT_SENDER_EMAIL = 'unknown@otzaria.invalid';

// תקרות אורך לשדות הדיווח. בלעדיהן גוף בקשה ענק נשמר ב-MongoDB ונשלח ב-SMTP
// כמו שהוא (DoS של אחסון/זיכרון, או מיילים בגודל חריג). תוכנת אוצריא שולחת
// שדות קצרים בהרבה מהתקרות האלה, ולכן דיווחים לגיטימיים אינם נפגעים.
export const FIELD_CAPS = {
  subject: 500,
  book_title: 300,
  current_ref: 300,
  selected_text: 10_000,
  error_details: 10_000,
  context_text: 20_000,
  file_path: 1_000,
  source_folder: 200,
};

// חלון מניעת כפילות: לא נשלח תוכן זהה לאותו נמען בתוך פרק זמן זה.
// ברירת מחדל 6 חודשים, ניתן להגדיל דרך משתנה סביבה REPORT_DEDUP_MONTHS.
export const DEDUP_WINDOW_MONTHS = Math.max(6, Number(process.env.REPORT_DEDUP_MONTHS) || 6);

// מיפוי מקורות לכתובות מייל - בהתבסס על error_report_dialog.dart
export const SOURCE_EMAIL_MAPPING = {
  'sefariaToOtzaria': 'corrections@sefaria.org',
  'sefaria': 'corrections@sefaria.org',
  'wikiJewishBooks': 'WikiJewishBooks@gmail.com',
  'wikiSource': 'novartza@gmail.com',
  'Pninim': 'contact@pninim.org',
  'Tashma': 'jewishoffice@gmail.com',
  'Dicta': 'jewishoffice@gmail.com',
  'Ben-Yehuda': 'editor@benyehuda.org',
  'yam-HaHachma': 'y025837086@gmail.com',
};

export function toSafeString(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

export function capField(value, maxLen, fallback) {
  return toSafeString(value, fallback).slice(0, maxLen);
}

export function toSafeLineNumber(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 1;
}

export function toSafeIsoDate(value) {
  const date = new Date(value ?? Date.now());
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return new Date().toISOString();
}

export function extractLibraryVersion(payload) {
  const explicitVersion = String(payload?.library_version ?? '').trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  // codeql[js/polynomial-redos]: errorDetails is public untrusted input; cap its length
  // before regex matching to bound the engine's worst-case work (no legitimate diagnostic
  // text is anywhere near this size).
  const errorDetails = String(payload?.error_details ?? '').slice(0, 5000);
  const match = errorDetails.match(/גרסת\s*ספרי(?:י|')ה\s*:\s*(.+)$/m);
  if (match?.[1]) {
    const version = match[1].trim();
    if (version) {
      return version;
    }
  }

  return 'unknown';
}

export function normalizePayload(payload) {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const senderCandidate = toSafeString(raw.sender_email);
  const senderValidation = validateEmail(senderCandidate);
  const senderEmail = senderValidation.isValid
    ? senderCandidate
    : DEFAULT_SENDER_EMAIL;

  // מזהה הדיווח משמש מפתח upsert ב-MongoDB — מוגבל באורכו כדי שבקשה זדונית
  // לא תוכל לדחוף מפתחות ענקיים לאינדקס/לוגים
  const reportId = toSafeString(
    raw.report_id,
    `missing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  ).slice(0, 128);

  // תקרות אורך (FIELD_CAPS) — מגבילות גם את מה שנשמר ב-DB וגם את מה שנשלח במייל
  const subject = capField(raw.subject, FIELD_CAPS.subject, 'דיווח טעות ללא נושא');
  const bookTitle = capField(raw.book_title, FIELD_CAPS.book_title, 'לא צוין ספר');
  const currentRef = capField(raw.current_ref, FIELD_CAPS.current_ref, 'לא צוין מיקום');
  const lineNumber = toSafeLineNumber(raw.line_number);
  const selectedText = capField(raw.selected_text, FIELD_CAPS.selected_text, '(לא נשלח טקסט מסומן)');
  const errorDetails = capField(raw.error_details, FIELD_CAPS.error_details, '(לא נשלח פירוט טעות)');
  const contextText = capField(raw.context_text, FIELD_CAPS.context_text, '(לא נשלח טקסט הקשר)');
  const filePath = capField(raw.file_path, FIELD_CAPS.file_path, '(לא נשלח נתיב קובץ)');
  const sourceFolder = capField(raw.source_folder, FIELD_CAPS.source_folder, '(לא נשלחה תיקיית מקור)');
  const createdAt = toSafeIsoDate(raw.created_at);
  const libraryVersion = extractLibraryVersion(raw);

  return {
    report_id: reportId,
    sender_email: senderEmail,
    subject: subject,
    book_title: bookTitle,
    current_ref: currentRef,
    line_number: lineNumber,
    selected_text: selectedText,
    error_details: errorDetails,
    context_text: contextText,
    file_path: filePath,
    source_folder: sourceFolder,
    created_at: createdAt,
    library_version: libraryVersion,
  };
}

export function ensureSmtpConfig() {
  const requiredEnv = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ];

  const missing = requiredEnv.filter((key) => !process.env[key]);
  return missing;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// נרמול כתובת מייל להשוואה עקבית (אותיות קטנות, ללא רווחים)
export function normalizeRecipient(email) {
  return String(email ?? '').trim().toLowerCase();
}

// טביעת אצבע (SHA-256) של כל תוכן הדיווח. שינוי בכל אחד מהשדות -> טביעה שונה.
// מטא-דאטה משתנה (מזהה דיווח, שולח, חותמת זמן) אינו נכלל בכוונה.
export function computeContentHash(payload) {
  const parts = [
    payload.book_title,
    payload.current_ref,
    payload.line_number,
    payload.selected_text,
    payload.error_details,
    payload.context_text,
    payload.source_folder,
  ].map((value) => String(value ?? '').trim());

  const legacyHash = crypto.createHash('sha256').update(parts.join('\\u0000')).digest('hex');
  if (payload.correction == null) return legacyHash;

  // Display fields are capped; hash the full correction in a fixed field order.
  // JSON preserves accepted UTF-16 code units, including split surrogate contexts.
  const c = payload.correction;
  const offset = c.selectionOffset;
  return crypto.createHash('sha256').update(JSON.stringify([
    'otzaria-report-email', 2, legacyHash,
    c.originalLine, c.originalSelection,
    offset == null ? null : [offset.unit, offset.start, offset.end],
    c.proposedText, c.contextBefore, c.contextAfter, payload.he_ref ?? null,
  ])).digest('hex');
}

// מועד הסף - תוכן שנשלח לפניו נחשב "ישן" וניתן לשלוח שוב.
// מקבל תאריך ייחוס אופציונלי (ברירת מחדל: עכשיו) כדי לאפשר בדיקה דטרמיניסטית.
export function getDedupCutoff(referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - DEDUP_WINDOW_MONTHS);
  return cutoff;
}

export function getEmailRecipients(sourceFolder) {
  if (!sourceFolder) {
    return {
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: null,
      isSefariaOnly: false
    };
  }

  const normalizedSource = sourceFolder.toLowerCase();

  // בדיקה אם זה ספריא - שליחה לספריא עם עותק לתא שמע
  if (normalizedSource.includes('sefaria')) {
    return {
      primary: SEFARIA_ERRORS_RECIPIENT,
      cc: SOURCE_EMAIL_MAPPING.Tashma || null,
      isSefariaOnly: true
    };
  }

  // בדיקה של מקורות אחרים - שליחה גם לאוצריא וגם למקור
  for (const [sourceKey, sourceEmail] of Object.entries(SOURCE_EMAIL_MAPPING)) {
    if (sourceKey !== 'sefaria' && sourceKey !== 'sefariaToOtzaria' &&
        normalizedSource.includes(sourceKey.toLowerCase())) {
      return {
        primary: REPORTING_ERRORS_RECIPIENT,
        cc: sourceEmail,
        isSefariaOnly: false
      };
    }
  }

  // ברירת מחדל - רק לאוצריא
  return {
    primary: REPORTING_ERRORS_RECIPIENT,
    cc: null,
    isSefariaOnly: false
  };
}

// תוויות שבנתיב תוכן העניינים של אוצריא ("סימן שיח") — ספריא לא מזהה אותן ונופלת לתחילת הספר.
const REF_LABEL_RE = /^(?:סעיף קטן|סימן|סעיף|פרק|פסוק|הלכה|דף|עמוד)\s+/;

export function buildSefariaLink(bookTitle, currentRef, heRef) {
  // heRef הוא מראה המקום של ספריא עצמה (seforim.db), ומוביל לסגמנט המדויק.
  const exactRef = String(heRef ?? '').replace(/\s+/g, ' ').trim();
  if (exactRef) return `https://www.sefaria.org/${encodeURIComponent(exactRef)}`;
  if (!bookTitle || !currentRef) return '';

  let cleanRef = currentRef;
  if (cleanRef.startsWith(bookTitle)) {
    cleanRef = cleanRef.substring(bookTitle.length).replace(/^[,\s]+/, '');
  }
  cleanRef = cleanRef
    .split(',')
    .map((part) => part.trim().replace(REF_LABEL_RE, ''))
    .filter(Boolean)
    .join(', ');
  return `https://www.sefaria.org/${encodeURIComponent(`${bookTitle}, ${cleanRef}`)}`;
}

const WORDS_AROUND_CHANGE = 4;
const CORRECTION_BLOCK_MARKER = '--- הצעת תיקון ---';

const HTML_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ' };

// סריקה קדימה בלבד: '>' בתוך מאפיין מצוטט אינו סוגר תגית, והערות אינן טקסט.
// סיומת תגית פגומה נשמרת פעם אחת, בלי סריקה חוזרת בכל '<' בתוכה.
function stripDisplayTags(text) {
  const parts = [];
  let keptFrom = 0;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf('<', searchFrom);
    if (start === -1) break;
    if (text.startsWith('<!--', start)) {
      const close = text.indexOf('-->', start + 4);
      parts.push(text.slice(keptFrom, start));
      keptFrom = close === -1 ? text.length : close + 3;
      searchFrom = keptFrom;
      continue;
    }
    const nameStart = start + (text[start + 1] === '/' ? 2 : 1);
    if (!/[a-z]/i.test(text[nameStart] ?? '')) {
      searchFrom = start + 1;
      continue;
    }
    let end = nameStart + 1;
    let quote = null;
    for (; end < text.length; end += 1) {
      const character = text[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === text.length) break;
    parts.push(text.slice(keptFrom, start));
    keptFrom = end + 1;
    searchFrom = keptFrom;
  }
  parts.push(text.slice(keptFrom));
  return parts.join('');
}

// הטקסט כפי שהוא מוצג באתר המקור, כדי שהקטע יימצא בחיפוש שם. <br> מפריד בין מילים.
function toDisplayWords(line) {
  return stripDisplayTags(String(line ?? '').replace(/<br\s*\/?>/gi, ' '))
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
      if (name[0] !== '#') return HTML_ENTITIES[name.toLowerCase()] ?? entity;
      const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * כמה מילים סביב השינוי, כפי שהן בספר ואחרי התיקון (השינוי מסומן בכוכביות),
 * כדי שהמקבל יאתר את המקום בחיפוש באתר שלו. null כשאין שינוי בטקסט הנראה.
 */
export function buildCorrectionSnippets(correction) {
  const newLine = computeNewLine(correction);
  if (newLine === null) return null;
  const oldWords = toDisplayWords(correction.originalLine);
  const newWords = toDisplayWords(newLine);
  let prefix = 0;
  while (prefix < oldWords.length && prefix < newWords.length && oldWords[prefix] === newWords[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldWords.length - prefix &&
    suffix < newWords.length - prefix &&
    oldWords[oldWords.length - 1 - suffix] === newWords[newWords.length - 1 - suffix]
  ) suffix++;
  if (prefix === oldWords.length && prefix === newWords.length) return null;

  const from = Math.max(0, prefix - WORDS_AROUND_CHANGE);
  const until = Math.min(oldWords.length, oldWords.length - suffix + WORDS_AROUND_CHANGE);
  const changed = newWords.slice(prefix, newWords.length - suffix);
  const deleted = oldWords.slice(prefix, oldWords.length - suffix);
  const wrong = oldWords.slice(from, until).join(' ');
  const original = oldWords.join(' ');
  const needle = ` ${wrong} `;
  const searchable = ` ${original} `;
  const first = searchable.indexOf(needle);
  const ambiguous = first >= 0 && searchable.indexOf(needle, first + 1) >= 0;
  return {
    wrong,
    fixed: [
      ...newWords.slice(from, prefix),
      changed.length ? `*${changed.join(' ')}*` : `*(נמחק: ${deleted.join(' ')})*`,
      ...newWords.slice(newWords.length - suffix, Math.min(newWords.length, newWords.length - suffix + WORDS_AROUND_CHANGE)),
    ].join(' '),
    // שורה יכולה להכיל את אותו קטע כמה פעמים. המיקום והנוסחים המלאים מגיעים
    // גם למטפל בדוא״ל; השדות המדויקים וההיסטים בחוזה נשארים ללא שינוי.
    ...(ambiguous ? { context: {
      wordStart: from + 1, wordEnd: until, wordCount: oldWords.length,
      original, corrected: newWords.join(' '),
    } } : {}),
  };
}

/** הערת המדווח בלי בלוק ההצעה שהתוכנה מצרפת ל-error_details (מוצג כבר כטקסט שגוי/מתוקן). */
function reporterNote(errorDetails) {
  const details = String(errorDetails ?? '');
  const index = details.lastIndexOf(CORRECTION_BLOCK_MARKER);
  return (index >= 0 ? details.slice(0, index) : details).trim();
}

const htmlBox = (escapedValue) =>
  `<div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escapedValue}</div>`;

function correctionSectionsHtml(snippets, note) {
  return `
          <h2 style="font-size: 18px; margin-bottom: 8px;">הטקסט השגוי</h2>
          ${htmlBox(escapeHtml(snippets.wrong))}
          <h2 style="font-size: 18px; margin: 20px 0 8px;">הטקסט המתוקן</h2>
          ${htmlBox(escapeHtml(snippets.fixed))}
          ${snippets.context ? `
          <p>${escapeHtml(correctionContextLabel(snippets.context))}</p>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">השורה המקורית המלאה</h2>
          ${htmlBox(escapeHtml(snippets.context.original))}
          <h2 style="font-size: 18px; margin: 20px 0 8px;">השורה המתוקנת המלאה</h2>
          ${htmlBox(escapeHtml(snippets.context.corrected))}` : ''}
          ${note ? `<h2 style="font-size: 18px; margin: 20px 0 8px;">הערת המדווח</h2>
          ${htmlBox(escapeHtml(note))}` : ''}`;
}

function correctionContextLabel(context) {
  return `הקטע מופיע יותר מפעם אחת בשורה. מיקום הקטע: מילים ${context.wordStart}–${context.wordEnd} מתוך ${context.wordCount}.`;
}

function emailView(payload) {
  const isSefariaSource = getEmailRecipients(payload.source_folder).isSefariaOnly;
  return {
    isSefariaSource,
    sefariaLink: isSefariaSource ? buildSefariaLink(payload.book_title, payload.current_ref, payload.he_ref) : '',
    // הצעת תיקון נשלחת במייל רק למקור החיצוני (לאוצריא היא נכנסת למערכת התיקונים),
    // וכל מקור צריך לאתר את המקום בחיפוש בטקסט שלו.
    snippets: buildCorrectionSnippets(payload.correction),
  };
}

/** Prepare correction snippets once for both formats; never cache across reports. */
export function buildEmailBodies(payload, ccRecipients = []) {
  const view = emailView(payload);
  return {
    html: renderHtml(payload, ccRecipients, view),
    text: renderText(payload, ccRecipients, view),
  };
}

export function buildHtml(payload, ccRecipients = []) {
  return renderHtml(payload, ccRecipients, emailView(payload));
}

function renderHtml(payload, ccRecipients, { isSefariaSource, sefariaLink, snippets }) {
  const escaped = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)])
  );
  const libraryVersion = escapeHtml(extractLibraryVersion(payload));

  // הודעת העותק משקפת את נמעני ה-cc שבאמת קיבלו (לאחר סינון כפילויות), לא את המיפוי
  const ccList = (Array.isArray(ccRecipients) ? ccRecipients : [ccRecipients]).filter(Boolean);
  const ccNotification = ccList.length > 0 ?
    `<div style="background: #e8f4fd; border: 2px solid #2196f3; margin: 16px; padding: 16px; border-radius: 8px; text-align: center;">
      <strong style="color: #1976d2; font-size: 16px;">📧 עותק מדיווח זה נשלח גם ל: ${escapeHtml(ccList.join(', '))}</strong>
    </div>` : '';

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; background: #f7f4ef; padding: 24px; color: #222;">
      <div style="max-width: 760px; margin: 0 auto; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid #eadfce;">
        <div style="background: #d4a373; color: #fff; padding: 18px 24px;">
          <h1 style="margin: 0; font-size: 24px;">דיווח טעות חדש מאוצריא</h1>
        </div>
        ${ccNotification}
        <div style="padding: 24px; line-height: 1.7;">
          <p><strong>ספר:</strong> ${escaped.book_title}</p>
          <p><strong>מיקום:</strong> ${escaped.current_ref}</p>
          ${isSefariaSource ? `<p><strong>קישור ישיר:</strong> <a href="${sefariaLink}" target="_blank" style="color: #d4a373;">${sefariaLink}</a></p>` : ''}
          <p><strong>שורה:</strong> ${escaped.line_number}</p>
          <p><strong>גרסת ספרייה:</strong> ${libraryVersion}</p>
          <p><strong>נתיב:</strong> ${escaped.file_path}</p>
          <p><strong>תיקיית מקור:</strong> ${escaped.source_folder}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          ${snippets ? correctionSectionsHtml(snippets, reporterNote(payload.error_details)) : `
          <h2 style="font-size: 18px; margin-bottom: 8px;">הטקסט המסומן</h2>
          ${htmlBox(escaped.selected_text)}
          <h2 style="font-size: 18px; margin: 20px 0 8px;">פירוט הטעות</h2>
          ${htmlBox(escaped.error_details)}
          <h2 style="font-size: 18px; margin: 20px 0 8px;">הקשר</h2>
          ${htmlBox(escaped.context_text)}`}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p><strong>שולח:</strong> ${escaped.sender_email}</p>
          <p><strong>נוצר בתאריך:</strong> ${escaped.created_at}</p>
          <p><strong>מזהה דיווח:</strong> ${escaped.report_id}</p>
        </div>
      </div>
    </div>
  `;
}

export function buildText(payload, ccRecipients = []) {
  return renderText(payload, ccRecipients, emailView(payload));
}

function renderText(payload, ccRecipients, { isSefariaSource, sefariaLink, snippets }) {
  const lines = [
    `ספר: ${payload.book_title}`,
    `מיקום: ${payload.current_ref}`,
  ];

  if (isSefariaSource && sefariaLink) {
    lines.push(`קישור ישיר: ${sefariaLink}`);
  }

  // הודעת העותק משקפת את נמעני ה-cc שבאמת קיבלו (לאחר סינון כפילויות)
  const ccList = (Array.isArray(ccRecipients) ? ccRecipients : [ccRecipients]).filter(Boolean);
  if (ccList.length > 0) {
    lines.push(`** עותק מדיווח זה נשלח גם ל: ${ccList.join(', ')} **`);
  }

  lines.push(
    `שורה: ${payload.line_number}`,
    `גרסת ספרייה: ${extractLibraryVersion(payload)}`,
    `נתיב: ${payload.file_path}`,
    `תיקיית מקור: ${payload.source_folder}`,
    '',
  );
  if (snippets) {
    const note = reporterNote(payload.error_details);
    lines.push('הטקסט השגוי:', snippets.wrong, '', 'הטקסט המתוקן:', snippets.fixed, '');
    if (snippets.context) {
      lines.push(correctionContextLabel(snippets.context), '',
        'השורה המקורית המלאה:', snippets.context.original, '',
        'השורה המתוקנת המלאה:', snippets.context.corrected, '');
    }
    if (note) lines.push('הערת המדווח:', note, '');
  } else {
    lines.push('הטקסט המסומן:', payload.selected_text, '', 'פירוט הטעות:', payload.error_details, '', 'הקשר:', payload.context_text, '');
  }
  lines.push(
    `שולח: ${payload.sender_email}`,
    `נוצר בתאריך: ${payload.created_at}`,
    `מזהה דיווח: ${payload.report_id}`,
  );

  return lines.join('\n');
}
