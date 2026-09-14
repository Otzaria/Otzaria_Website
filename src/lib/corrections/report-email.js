/**
 * התראת המייל על דיווח טעות (הועבר מ-api/reportingerrors/route.js בלי שינוי התנהגות
 * ה-dedup). המייל הוא התראה בלבד — כשל כאן לעולם אינו מכשיל דיווח שנשמר.
 */
import crypto from 'crypto';
import { validateEmail } from '../validation-utils.js';
import ErrorReport from '../../models/ErrorReport.js';
import SentEmailLog from '../../models/SentEmailLog.js';
import { createSmtpTransport } from '../smtp-transport.js';

const REPORTING_ERRORS_RECIPIENT = 'otzaria.200@gmail.com';
const SEFARIA_ERRORS_RECIPIENT = 'corrections@sefaria.org';
const DEFAULT_SENDER_EMAIL = 'unknown@otzaria.invalid';

// תקרות אורך לשדות הדיווח. בלעדיהן גוף בקשה ענק נשמר ב-MongoDB ונשלח ב-SMTP
// כמו שהוא (DoS של אחסון/זיכרון, או מיילים בגודל חריג). תוכנת אוצריא שולחת
// שדות קצרים בהרבה מהתקרות האלה, ולכן דיווחים לגיטימיים אינם נפגעים.
const FIELD_CAPS = {
  subject: 500,
  book_title: 300,
  current_ref: 300,
  selected_text: 10_000,
  error_details: 10_000,
  context_text: 20_000,
  file_path: 1_000,
  source_folder: 200,
};

function capField(value, maxLen, fallback) {
  return toSafeString(value, fallback).slice(0, maxLen);
}

// P2 (ביקורת קוד): request.json() טוען ומפענח את כל ה-body לזיכרון לפני
// שהתקרות מיושמות — כלומר בלי מגבלה כאן גוף ענק היה צורך RAM פר-בקשה.
// פתרון דו-שכבתי:
//   1. בדיקת Content-Length מוקדמת (זולה; לא אמינה נגד header שקרי)
//   2. קריאת streaming עם abort ברגע חריגה מהתקרה — נאכפת בפועל גם כשה-header
//      שקרי/חסר (chunked), בלי להחזיק יותר מ-maxBytes בזיכרון אי פעם.
// שכבת proxy/ingress צריכה להוסיף limit משלה (למשל client_max_body_size),
// אבל ה-API כבר אינו מקבל body ללא הגבלה גם בלעדיה.
export const MAX_REPORT_BODY_BYTES = 256 * 1024; // 256KB — הרבה מעל כל דיווח אמיתי

export async function readJsonBodyLimited(request, maxBytes) {
  const tooLarge = () => Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' });
  const invalidJson = () => Object.assign(new Error('invalid JSON'), { code: 'INVALID_JSON' });

  const contentLength = Number(request.headers.get('content-length') || '');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw tooLarge();
  }

  if (!request.body) {
    throw invalidJson();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try { await reader.cancel(); } catch { /* כבר מתה */ }
      throw tooLarge();
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder('utf-8').decode(merged));
  } catch {
    throw invalidJson();
  }
}

// חלון מניעת כפילות: לא נשלח תוכן זהה לאותו נמען בתוך פרק זמן זה.
// ברירת מחדל 6 חודשים, ניתן להגדיל דרך משתנה סביבה REPORT_DEDUP_MONTHS.
const DEDUP_WINDOW_MONTHS = Math.max(6, Number(process.env.REPORT_DEDUP_MONTHS) || 6);

// נרמול כתובת מייל להשוואה עקבית (אותיות קטנות, ללא רווחים)
function normalizeRecipient(email) {
  return String(email ?? '').trim().toLowerCase();
}

// טביעת אצבע (SHA-256) של כל תוכן הדיווח. שינוי בכל אחד מהשדות -> טביעה שונה.
// מטא-דאטה משתנה (מזהה דיווח, שולח, חותמת זמן) אינו נכלל בכוונה.
function computeContentHash(payload) {
  const parts = [
    payload.book_title,
    payload.current_ref,
    payload.line_number,
    payload.selected_text,
    payload.error_details,
    payload.context_text,
    payload.source_folder,
  ].map((value) => String(value ?? '').trim());

  return crypto.createHash('sha256').update(parts.join('\\u0000')).digest('hex');
}

// מועד הסף - תוכן שנשלח לפניו נחשב "ישן" וניתן לשלוח שוב
function getDedupCutoff() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - DEDUP_WINDOW_MONTHS);
  return cutoff;
}

// תפיסה אטומית של צירוף נמען+תוכן *לפני* השליחה בפועל.
// בזכות האינדקס הייחודי {recipient, contentHash}, רק בקשה אחת מצליחה לתפוס
// צירוף נתון - כך שתי בקשות מקבילות זהות לא ישלחו מייל כפול (תופעת הלוואי
// נאכפת לפני sendMail, לא אחריו). findOneAndUpdate מבצע התאמה+עדכון אטומית,
// כך שגם תחרות על אותה רשומה ישנה מסתיימת בתפיסה יחידה בלבד.
// מחזיר { recipient, claimed, inserted, previousLastSentAt } לצורך שחזור.
async function claimRecipient(recipient, contentHash, cutoff, sentAt, payload) {
  try {
    // ברירת המחדל מחזירה את המסמך כפי שהיה *לפני* העדכון (או null אם נוצר חדש)
    const previousDoc = await SentEmailLog.findOneAndUpdate(
      { recipient, contentHash, lastSentAt: { $lt: cutoff } },
      {
        $set: {
          lastSentAt: sentAt,
          reportId: payload.report_id,
          bookTitle: payload.book_title,
        },
      },
      { upsert: true }
    );

    return {
      recipient,
      claimed: true,
      inserted: previousDoc === null, // null => נוצרה רשומה חדשה
      previousLastSentAt: previousDoc?.lastSentAt ?? null,
    };
  } catch (error) {
    // E11000 = הצירוף כבר תפוס (נשלח לאחרונה, או בקשה מקבילה תפסה אותו זה עתה)
    if (error?.code === 11000) {
      return { recipient, claimed: false };
    }
    throw error;
  }
}

// שחזור תפיסות שבוצעו, אם השליחה נכשלה - כדי לא לחסום שליחה עתידית לשווא
async function releaseClaims(claims, contentHash) {
  await Promise.all(
    claims
      .filter((claim) => claim.claimed)
      .map((claim) => {
        if (claim.inserted) {
          // רשומה חדשה שנוצרה כעת - מחיקה מלאה
          return SentEmailLog.deleteOne({ recipient: claim.recipient, contentHash });
        }
        // רשומה ישנה שעודכנה - החזרת חותמת הזמן הקודמת
        return SentEmailLog.updateOne(
          { recipient: claim.recipient, contentHash },
          { $set: { lastSentAt: claim.previousLastSentAt } }
        );
      })
  );
}

// מיפוי מקורות לכתובות מייל - בהתבסס על error_report_dialog.dart
const SOURCE_EMAIL_MAPPING = {
  'sefariaToOtzaria': 'corrections@sefaria.org',
  'sefaria': 'corrections@sefaria.org',
  'wiki_jewish_books': 'WikiJewishBooks@gmail.com',
  'wikiSource': 'novartza@gmail.com',
  'Pninim': 'contact@pninim.org',
  'Tashma': 'jewishoffice@gmail.com',
  'Ben-Yehuda': 'editor@benyehuda.org',
};

function extractLibraryVersion(payload) {
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

function toSafeString(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function toSafeLineNumber(value) {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return 1;
}

function toSafeIsoDate(value) {
  const date = new Date(value ?? Date.now());
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }
  return new Date().toISOString();
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getEmailRecipients(sourceFolder) {
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

function buildSefariaLink(bookTitle, currentRef) {
  if (!bookTitle || !currentRef) return '';
  
  // Clean the reference - remove book title if it's duplicated at the start
  let cleanRef = currentRef;
  if (cleanRef.startsWith(bookTitle)) {
    cleanRef = cleanRef.substring(bookTitle.length).replace(/^[,\s]+/, '');
  }
  
  // Create the Sefaria URL with comma separator (not dot)
  const encodedBook = encodeURIComponent(bookTitle);
  const encodedRef = encodeURIComponent(cleanRef);
  return `https://www.sefaria.org/${encodedBook}, ${encodedRef}`;
}

function buildHtml(payload, ccRecipients = []) {
  const escaped = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)])
  );
  const libraryVersion = escapeHtml(extractLibraryVersion(payload));

  // Get email recipients info (source-based: קובע אם להציג קישור ספריא)
  const emailInfo = getEmailRecipients(payload.source_folder);
  const isSefariaSource = emailInfo.isSefariaOnly;
  const sefariaLink = isSefariaSource ? buildSefariaLink(payload.book_title, payload.current_ref) : '';
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
          <h2 style="font-size: 18px; margin-bottom: 8px;">הטקסט המסומן</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.selected_text}</div>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">פירוט הטעות</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.error_details}</div>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">הקשר</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.context_text}</div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p><strong>שולח:</strong> ${escaped.sender_email}</p>
          <p><strong>נוצר בתאריך:</strong> ${escaped.created_at}</p>
          <p><strong>מזהה דיווח:</strong> ${escaped.report_id}</p>
        </div>
      </div>
    </div>
  `;
}

function buildText(payload, ccRecipients = []) {
  // Get email recipients info (source-based: קובע אם להציג קישור ספריא)
  const emailInfo = getEmailRecipients(payload.source_folder);
  const isSefariaSource = emailInfo.isSefariaOnly;
  const sefariaLink = isSefariaSource ? buildSefariaLink(payload.book_title, payload.current_ref) : '';

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
    'הטקסט המסומן:',
    payload.selected_text,
    '',
    'פירוט הטעות:',
    payload.error_details,
    '',
    'הקשר:',
    payload.context_text,
    '',
    `שולח: ${payload.sender_email}`,
    `נוצר בתאריך: ${payload.created_at}`,
    `מזהה דיווח: ${payload.report_id}`,
  );
  
  return lines.join('\n');
}


/**
 * שולח את מייל ההתראה עבור דיווח שכבר נשמר. לעולם אינו זורק.
 * @returns {Promise<{emailSent:boolean, duplicate:boolean, error:(string|null)}>}
 */
export async function notifyReportByEmail(payload, { transportFactory = createSmtpTransport } = {}) {
  const missingSmtp = ensureSmtpConfig();
  if (missingSmtp.length > 0) {
    await markEmail(payload.report_id, { emailSent: false, adminNotes: `מייל לא נשלח: חסרים משתני סביבה ${missingSmtp.join(', ')}` });
    return { emailSent: false, duplicate: false, error: 'smtp_not_configured' };
  }

  const claims = [];
  let contentHash;
  let emailDelivered = false;
  try {
    const transporter = transportFactory();
    const senderValidation = validateEmail(payload.sender_email);
    const replyTo = senderValidation.isValid ? payload.sender_email : undefined;
    const emailInfo = getEmailRecipients(payload.source_folder);
    const candidateRecipients = [
      ...new Set([emailInfo.primary, emailInfo.cc].map(normalizeRecipient).filter(Boolean)),
    ];

    // מניעת כפילות אטומית: תפיסת כל נמען לפני השליחה (ראו claimRecipient).
    contentHash = computeContentHash(payload);
    const cutoff = getDedupCutoff();
    const sentAt = new Date();
    for (const recipient of candidateRecipients) {
      claims.push(await claimRecipient(recipient, contentHash, cutoff, sentAt, payload));
    }
    const allowedRecipients = claims.filter((c) => c.claimed).map((c) => c.recipient);

    if (allowedRecipients.length === 0) {
      await markEmail(payload.report_id, {
        emailSent: false,
        adminNotes: `נחסם: תוכן זהה כבר נשלח לכל הנמענים ב-${DEDUP_WINDOW_MONTHS} החודשים האחרונים (טביעת אצבע: ${contentHash}).`,
      });
      return { emailSent: false, duplicate: true, error: null };
    }

    const toRecipient = allowedRecipients.includes(normalizeRecipient(emailInfo.primary))
      ? normalizeRecipient(emailInfo.primary)
      : allowedRecipients[0];
    const ccRecipients = allowedRecipients.filter((r) => r !== toRecipient);
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: toRecipient,
      replyTo,
      subject: payload.subject,
      html: buildHtml(payload, ccRecipients),
      text: buildText(payload, ccRecipients),
      headers: {
        'X-Otzaria-Report-Id': payload.report_id,
        'X-Otzaria-Book-Title': payload.book_title,
      },
    };
    if (ccRecipients.length > 0) mailOptions.cc = ccRecipients;

    await transporter.sendMail(mailOptions);
    emailDelivered = true;
    await markEmail(payload.report_id, { emailSent: true, emailSentAt: sentAt });
    return { emailSent: true, duplicate: false, error: null };
  } catch (error) {
    console.error('Reporting errors email failure:', error?.message);
    if (!emailDelivered && claims.length > 0) {
      try {
        await releaseClaims(claims, contentHash);
      } catch (releaseError) {
        console.error('Error releasing claims after failure:', releaseError?.message);
      }
    }
    if (!emailDelivered) await markEmail(payload.report_id, { emailSent: false, adminNotes: `שגיאה בשליחת מייל: ${error?.message}` });
    return { emailSent: emailDelivered, duplicate: false, error: emailDelivered ? null : 'smtp_failed' };
  }
}

async function markEmail(reportId, set) {
  try {
    await ErrorReport.updateOne({ reportId }, { $set: set });
  } catch (err) {
    console.error('Error updating report email status:', err?.message);
  }
}
