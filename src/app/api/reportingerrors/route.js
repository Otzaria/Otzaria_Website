import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { validateEmail, validateRequired } from '@/lib/validation-utils';
import connectDB from '@/lib/db';
import ErrorReport from '@/models/ErrorReport';

const REPORTING_ERRORS_RECIPIENT = 'otzaria.200@gmail.com';

const REQUIRED_FIELDS = [
  ['report_id', 'מזהה דיווח'],
  ['sender_email', 'כתובת שולח'],
  ['subject', 'נושא'],
  ['book_title', 'שם הספר'],
  ['current_ref', 'מיקום'],
  ['line_number', 'מספר שורה'],
  ['selected_text', 'טקסט מסומן'],
  ['error_details', 'פירוט הטעות'],
  ['context_text', 'טקסט הקשר'],
  ['file_path', 'נתיב קובץ'],
  ['source_folder', 'תיקיית מקור'],
  ['created_at', 'זמן יצירה'],
];

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Body חייב להיות אובייקט JSON תקין';
  }

  for (const [fieldName, label] of REQUIRED_FIELDS) {
    const value = payload[fieldName];

    if (fieldName === 'line_number') {
      if (!Number.isInteger(value) || value <= 0) {
        return `${label} חייב להיות מספר שלם גדול מאפס`;
      }
      continue;
    }

    const result = validateRequired(String(value ?? ''), label);
    if (!result.isValid) {
      return result.error;
    }
  }

  const senderValidation = validateEmail(String(payload.sender_email));
  if (!senderValidation.isValid) {
    return 'כתובת השולח אינה תקינה';
  }

  const createdAt = new Date(payload.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return 'זמן היצירה אינו בפורמט תקין';
  }

  return null;
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

function buildHtml(payload) {
  const escaped = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)])
  );

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; background: #f7f4ef; padding: 24px; color: #222;">
      <div style="max-width: 760px; margin: 0 auto; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid #eadfce;">
        <div style="background: #d4a373; color: #fff; padding: 18px 24px;">
          <h1 style="margin: 0; font-size: 24px;">דיווח טעות חדש מאוצריא</h1>
        </div>
        <div style="padding: 24px; line-height: 1.7;">
          <p><strong>ספר:</strong> ${escaped.book_title}</p>
          <p><strong>מיקום:</strong> ${escaped.current_ref}</p>
          <p><strong>שורה:</strong> ${escaped.line_number}</p>
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

function buildText(payload) {
  return [
    `ספר: ${payload.book_title}`,
    `מיקום: ${payload.current_ref}`,
    `שורה: ${payload.line_number}`,
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
  ].join('\n');
}

export async function POST(request) {
  let payload;
  let savedToDatabase = false;
  try {
    payload = await request.json();

    const validationError = validatePayload(payload);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    // התחברות למסד הנתונים
    await connectDB();

    // שמירת הדיווח במסד הנתונים
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
      status: 'pending',
      emailSent: false
    });

    await errorReport.save();
    savedToDatabase = true;

    const missingSmtp = ensureSmtpConfig();
    if (missingSmtp.length > 0) {
      // גם אם שליחת המייל נכשלה, הדיווח נשמר במסד הנתונים
      return NextResponse.json(
        {
          success: false,
          error: `השרת אינו מוגדר לשליחת מייל. חסרים משתני סביבה: ${missingSmtp.join(', ')}`,
          reportId: payload.report_id,
          savedToDatabase
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

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: REPORTING_ERRORS_RECIPIENT,
      replyTo: payload.sender_email,
      subject: payload.subject,
      html: buildHtml(payload),
      text: buildText(payload),
      headers: {
        'X-Otzaria-Report-Id': payload.report_id,
        'X-Otzaria-Book-Title': payload.book_title,
      },
    });

    // עדכון שהמייל נשלח בהצלחה
    await ErrorReport.findOneAndUpdate(
      { reportId: payload.report_id },
      { 
        emailSent: true, 
        emailSentAt: new Date() 
      }
    );

    return NextResponse.json({
      success: true,
      message: 'הדיווח התקבל ונשלח בהצלחה',
      reportId: payload.report_id,
      savedToDatabase
    });
  } catch (error) {
    console.error('Reporting errors API error:', error);
    
    // אם יש שגיאה, ננסה לעדכן את הדיווח במסד הנתונים
    try {
      if (savedToDatabase && payload?.report_id) {
        await ErrorReport.findOneAndUpdate(
          { reportId: payload.report_id },
          { 
            adminNotes: `שגיאה בשליחת מייל: ${error?.message}`,
            emailSent: false
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
        savedToDatabase
      },
      { status: 500 }
    );
  }
}
