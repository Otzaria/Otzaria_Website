/**
 * התראת המייל על דיווח טעות. הלוגיקה הטהורה (נירמול, נמענים, תוכן המייל) ב-errorReportLogic.js;
 * המייל הוא התראה בלבד — כשל כאן לעולם אינו מכשיל דיווח שנשמר.
 */
import ErrorReport from '../../models/ErrorReport.js';
import SentEmailLog from '../../models/SentEmailLog.js';
import { createSmtpTransport } from '../smtp-transport.js';
import { validateEmail } from '../validation-utils.js';
import {
  DEDUP_WINDOW_MONTHS,
  REPORTING_ERRORS_RECIPIENT,
  buildHtml,
  buildText,
  computeContentHash,
  ensureSmtpConfig,
  getDedupCutoff,
  getEmailRecipients,
  normalizeRecipient,
} from '../errorReportLogic.js';

export { normalizePayload, ensureSmtpConfig } from '../errorReportLogic.js';

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

/**
 * האם מייל הדיווח מגיע לתיבת אוצריא (כנמען ראשי או בעותק) — תנאי הכניסה למערכת התיקונים.
 * נגזר מ-getEmailRecipients בלבד, כדי שלא יהיו שני כללים שיכולים לסטות זה מזה.
 */
export function reachesOtzariaInbox(sourceFolder) {
  const { primary, cc } = getEmailRecipients(sourceFolder);
  const otzaria = normalizeRecipient(REPORTING_ERRORS_RECIPIENT);
  return normalizeRecipient(primary) === otzaria || normalizeRecipient(cc) === otzaria;
}

/** אותו כלל כמסנן MongoDB לדיווחים ישנים: תיקייה שאינה מגיעה לאוצריא. */
export const NON_OTZARIA_SOURCE_FOLDER_RE = /sefaria/i;

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
