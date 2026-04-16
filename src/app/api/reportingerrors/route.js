import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { validateEmail } from '@/lib/validation-utils';
import connectDB from '@/lib/db';
import ErrorReport from '@/models/ErrorReport';

const REPORTING_ERRORS_RECIPIENT = 'otzaria.200@gmail.com';
const SEFARIA_ERRORS_RECIPIENT = 'corrections@sefaria.org';
const DEFAULT_SENDER_EMAIL = 'unknown@otzaria.invalid';

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

  const errorDetails = String(payload?.error_details ?? '');
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

function normalizePayload(payload) {
  const raw = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};

  const senderCandidate = toSafeString(raw.sender_email);
  const senderValidation = validateEmail(senderCandidate);
  const senderEmail = senderValidation.isValid
    ? senderCandidate
    : DEFAULT_SENDER_EMAIL;

  const reportId = toSafeString(
    raw.report_id,
    `missing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  const subject = toSafeString(raw.subject, 'דיווח טעות ללא נושא');
  const bookTitle = toSafeString(raw.book_title, 'לא צוין ספר');
  const currentRef = toSafeString(raw.current_ref, 'לא צוין מיקום');
  const lineNumber = toSafeLineNumber(raw.line_number);
  const selectedText = toSafeString(raw.selected_text, '(לא נשלח טקסט מסומן)');
  const errorDetails = toSafeString(raw.error_details, '(לא נשלח פירוט טעות)');
  const contextText = toSafeString(raw.context_text, '(לא נשלח טקסט הקשר)');
  const filePath = toSafeString(raw.file_path, '(לא נשלח נתיב קובץ)');
  const sourceFolder = toSafeString(raw.source_folder, '(לא נשלחה תיקיית מקור)');
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

function ensureSmtpConfig() {
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
  
  // בדיקה אם זה ספריא - שליחה רק לספריא
  if (normalizedSource.includes('sefaria')) {
    return {
      primary: SEFARIA_ERRORS_RECIPIENT,
      cc: null,
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

function buildHtml(payload) {
  const escaped = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)])
  );
  const libraryVersion = escapeHtml(extractLibraryVersion(payload));
  
  // Check if source is Sefaria
  const isSefariaSource = payload.source_folder && payload.source_folder.toLowerCase().includes('sefaria');
  const sefariaLink = isSefariaSource ? buildSefariaLink(payload.book_title, payload.current_ref) : '';
  
  // Get email recipients info
  const emailInfo = getEmailRecipients(payload.source_folder);
  const ccNotification = emailInfo.cc ? 
    `<div style="background: #e8f4fd; border: 2px solid #2196f3; margin: 16px; padding: 16px; border-radius: 8px; text-align: center;">
      <strong style="color: #1976d2; font-size: 16px;">📧 עותק מדיווח זה נשלח גם ל: ${emailInfo.cc}</strong>
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
          ${isSefariaSource ? `<p><strong>קישור ישיר:</strong> <a href="${sefariaLink}" target="_blank" style="color: #d4a373;">${sefariaLink}</a></p>` : ''}
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

function buildText(payload) {
  // Get email recipients info
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
  
  if (emailInfo.cc) {
    lines.push(`** עותק מדיווח זה נשלח גם ל: ${emailInfo.cc} **`);
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

export async function POST(request) {
  let payload;
  let savedToDatabase = false;
  try {
    const rawBody = await request.json();
    payload = normalizePayload(rawBody);

    await connectDB();

    const errorReport = new ErrorReport({
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
    });

    await errorReport.save();
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

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    const senderValidation = validateEmail(payload.sender_email);
    const replyTo = senderValidation.isValid ? payload.sender_email : undefined;

    // Check if this is a Sefaria source book
    const isSefariaSource = payload.source_folder && payload.source_folder.toLowerCase().includes('sefaria');

    // Send email to main recipient
    // Determine recipient based on source
    const emailInfo = getEmailRecipients(payload.source_folder);

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: emailInfo.primary,
      replyTo,
      subject: payload.subject,
      html: buildHtml(payload),
      text: buildText(payload),
      headers: {
        'X-Otzaria-Report-Id': payload.report_id,
        'X-Otzaria-Book-Title': payload.book_title,
      },
    };

    // Add CC if needed (for non-Sefaria sources that have additional recipients)
    if (emailInfo.cc) {
      mailOptions.cc = emailInfo.cc;
    }

    await transporter.sendMail(mailOptions);

    // If it's a Sefaria source, also send to Sefaria corrections
    if (isSefariaSource) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: SEFARIA_CORRECTIONS_EMAIL,
        replyTo,
        subject: `[Otzaria] ${payload.subject}`,
        html: buildHtml(payload),
        text: buildText(payload),
        headers: {
          'X-Otzaria-Report-Id': payload.report_id,
          'X-Otzaria-Book-Title': payload.book_title,
          'X-Otzaria-Source': 'Sefaria',
        },
      });
    }

    await ErrorReport.findOneAndUpdate(
      { reportId: payload.report_id },
      {
        emailSent: true,
        emailSentAt: new Date(),
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
