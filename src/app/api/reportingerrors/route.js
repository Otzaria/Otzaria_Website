import { NextResponse } from 'next/server';
import { validateEmail } from '@/lib/validation-utils';
import connectDB from '@/lib/db';
import ErrorReport from '@/models/ErrorReport';
import SentEmailLog from '@/models/SentEmailLog';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { createSmtpTransport } from '@/lib/smtp-transport';
import {
  DEDUP_WINDOW_MONTHS,
  buildHtml,
  buildText,
  computeContentHash,
  ensureSmtpConfig,
  getDedupCutoff,
  getEmailRecipients,
  normalizePayload,
  normalizeRecipient,
} from '@/lib/errorReportLogic';

// P2 (ביקורת קוד): request.json() טוען ומפענח את כל ה-body לזיכרון לפני
// שהתקרות מיושמות — כלומר בלי מגבלה כאן גוף ענק היה צורך RAM פר-בקשה.
// פתרון דו-שכבתי:
//   1. בדיקת Content-Length מוקדמת (זולה; לא אמינה נגד header שקרי)
//   2. קריאת streaming עם abort ברגע חריגה מהתקרה — נאכפת בפועל גם כשה-header
//      שקרי/חסר (chunked), בלי להחזיק יותר מ-maxBytes בזיכרון אי פעם.
// שכבת proxy/ingress צריכה להוסיף limit משלה (למשל client_max_body_size),
// אבל ה-API כבר אינו מקבל body ללא הגבלה גם בלעדיה.
const MAX_REPORT_BODY_BYTES = 256 * 1024; // 256KB — הרבה מעל כל דיווח אמיתי

async function readJsonBodyLimited(request, maxBytes) {
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

// הנתיב נשאר ציבורי מכוון: דיווחי הטעויות מגיעים מתוכנת אוצריא (ללא חשבון
// אתר), וכל שינוי בחוזה ה-API ישבור אותם. במקום אימות — הגבלת קצב לפי IP אמין
// (req.ip / קצה שרשרת XFF): דיווח אנושי אינו מתקרב לתקרה, ואילו ספאמר/סקריפט
// נחסם. כישלון ב-rate-limit עצמו לא יפיל דיווח לגיטימי.
export async function POST(request) {
  try {
    if (!checkRateLimit(getClientIp(request), 'error-report', 8, 'minute')) {
      return NextResponse.json(
        { success: false, error: 'Too many requests', reportId: null },
        { status: 429 }
      );
    }
  } catch {
    // כל חריגה כאן לא אמורה לקרות; לא מונעת את הדיווח עצמו
  }

  let payload;
  let savedToDatabase = false;
  // נשמרים בטווח הפונקציה כדי שניתן יהיה לשחרר תפיסות חלקיות בכל מסלול כשל
  let claims = [];
  let contentHash;
  let emailDelivered = false;
  try {
    // קריאת body עם תקרה אמיתית (streaming) — ראו הסבר ליד MAX_REPORT_BODY_BYTES
    let rawBody;
    try {
      rawBody = await readJsonBodyLimited(request, MAX_REPORT_BODY_BYTES);
    } catch (err) {
      if (err?.code === 'BODY_TOO_LARGE') {
        return NextResponse.json(
          { success: false, error: 'Report body too large', reportId: null },
          { status: 413 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body', reportId: null },
        { status: 400 }
      );
    }
    payload = normalizePayload(rawBody);

    await connectDB();

    await ErrorReport.findOneAndUpdate(
      { reportId: payload.report_id },
      {
        $setOnInsert: {
          reportId: payload.report_id,
          senderEmail: payload.sender_email,
          subject: payload.subject,
          bookTitle: payload.book_title,
          currentRef: payload.current_ref,
          lineNumber: payload.line_number,
          selectedText: payload.selected_text,
          errorDetails: payload.error_details,
          contextText: payload.context_text,
          filePath: payload.file_path,
          sourceFolder: payload.source_folder,
          libraryVersion: payload.library_version,
          status: 'pending',
          emailSent: false,
        },
      },
      { upsert: true }
    );
    savedToDatabase = true;

    const missingSmtp = ensureSmtpConfig();
    if (missingSmtp.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `השרת אינו מוגדר לשליחת מייל. חסרים משתני סביבה: ${missingSmtp.join(', ')}`,
          reportId: payload.report_id,
          savedToDatabase,
        },
        { status: 500 }
      );
    }

    // transporter משותף (src/lib/smtp-transport.js) — אימות TLS מלא
    // (rejectUnauthorized=true כברירת מחדל) ו-timeouts מוגדרים
    const transporter = createSmtpTransport();

    const senderValidation = validateEmail(payload.sender_email);
    const replyTo = senderValidation.isValid ? payload.sender_email : undefined;

    // Determine recipient based on source
    const emailInfo = getEmailRecipients(payload.source_folder);

    // רשימת הנמענים המיועדים (ראשי + עותק), מנורמלת וללא כפילויות
    const candidateRecipients = [
      ...new Set(
        [emailInfo.primary, emailInfo.cc]
          .map(normalizeRecipient)
          .filter(Boolean)
      ),
    ];

    // מניעת כפילות אטומית: תפיסת כל נמען לפני השליחה. נמען שכבר קיבל תוכן
    // זהה בתוך חלון הזמן (או שנתפס ע"י בקשה מקבילה) לא ייתפס - ולכן לא יקבל מייל.
    contentHash = computeContentHash(payload);
    const cutoff = getDedupCutoff();
    const sentAt = new Date();
    for (const recipient of candidateRecipients) {
      // סדרתי בכוונה - שומר על סדר התפיסות עבור שחזור מסודר בכישלון
      claims.push(await claimRecipient(recipient, contentHash, cutoff, sentAt, payload));
    }
    const allowedRecipients = claims
      .filter((claim) => claim.claimed)
      .map((claim) => claim.recipient);

    // אם אף נמען לא נתפס - כולם כבר קיבלו תוכן זהה, לא שולחים שוב בשום אופן
    if (allowedRecipients.length === 0) {
      await ErrorReport.findOneAndUpdate(
        { reportId: payload.report_id },
        {
          emailSent: false,
          adminNotes: `נחסם: תוכן זהה כבר נשלח לכל הנמענים ב-${DEDUP_WINDOW_MONTHS} החודשים האחרונים (טביעת אצבע: ${contentHash}).`,
        }
      );

      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `דיווח עם תוכן זהה כבר נשלח לנמענים אלו ב-${DEDUP_WINDOW_MONTHS} החודשים האחרונים. כדי למנוע כפילות, המייל לא נשלח שוב.`,
        reportId: payload.report_id,
        savedToDatabase,
      });
    }

    // שמירה על תפקיד הנמענים: הראשי נשאר "to" אם הותר, אחרת הראשון שהותר
    const toRecipient = allowedRecipients.includes(normalizeRecipient(emailInfo.primary))
      ? normalizeRecipient(emailInfo.primary)
      : allowedRecipients[0];
    const ccRecipients = allowedRecipients.filter((recipient) => recipient !== toRecipient);

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: toRecipient,
      replyTo,
      subject: payload.subject,
      // גוף המייל משקף את נמעני העותק שבאמת קיבלו (לאחר סינון כפילויות)
      html: buildHtml(payload, ccRecipients),
      text: buildText(payload, ccRecipients),
      headers: {
        'X-Otzaria-Report-Id': payload.report_id,
        'X-Otzaria-Book-Title': payload.book_title,
      },
    };

    // הוספת עותק רק לנמענים שהותרו (שלא קיבלו תוכן זהה לאחרונה)
    if (ccRecipients.length > 0) {
      mailOptions.cc = ccRecipients;
    }

    // התפיסות כבר רשמו lastSentAt=sentAt באופן אטומי לפני השליחה.
    // השחרור בכשל מרוכז ב-catch הכללי (לפי הדגל emailDelivered), כך שגם
    // תפיסה חלקית או שגיאה לפני sendMail לא משאירה lock תקוע ל-6 חודשים.
    await transporter.sendMail(mailOptions);
    emailDelivered = true;

    await ErrorReport.findOneAndUpdate(
      { reportId: payload.report_id },
      {
        emailSent: true,
        emailSentAt: sentAt,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'הדיווח התקבל ונשלח בהצלחה',
      reportId: payload.report_id,
      savedToDatabase,
    });
  } catch (error) {
    console.error('Reporting errors API error:', error);

    // שחרור תפיסות שנעשו אם המייל לא נשלח בפועל - בכל מסלול כשל (תפיסה חלקית,
    // שגיאה לפני sendMail, או כשל ב-sendMail עצמו). אם המייל כבר נשלח, התפיסות
    // לגיטימיות ונשמרות.
    if (!emailDelivered && claims.length > 0) {
      try {
        await releaseClaims(claims, contentHash);
      } catch (releaseError) {
        console.error('Error releasing claims after failure:', releaseError);
      }
    }

    try {
      if (savedToDatabase && payload?.report_id) {
        await ErrorReport.findOneAndUpdate(
          { reportId: payload.report_id },
          {
            adminNotes: `שגיאה בשליחת מייל: ${error?.message}`,
            emailSent: false,
          }
        );
      }
    } catch (dbError) {
      console.error('Error updating database after email failure:', dbError);
    }

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'שגיאת שרת פנימית',
        reportId: payload?.report_id,
        savedToDatabase,
      },
      { status: 500 }
    );
  }
}
