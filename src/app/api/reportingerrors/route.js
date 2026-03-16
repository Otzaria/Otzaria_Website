import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { validateEmail, validateRequired } from '@/lib/validation-utils';

const REPORTING_ERRORS_RECIPIENT = 'otzaria.200@gmail.com';

const REQUIRED_FIELDS = [
  ['report_id', 'מזהה דיווח'],
  ['sender_email', 'כתובת שולח'],
  ['subject', 'נושא'],
  ['body', 'תוכן מלא'],
  ['book_title', 'שם הספר'],
  ['current_ref', 'מיקום'],
  ['line_number', 'מספר שורה'],
  ['selected_text', 'טקסט מסומן'],
  ['error_details', 'פירוט הטעות'],
  ['context_text', 'טקסט הקשר'],
  ['file_name', 'שם קובץ'],
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
          <p><strong>מזהה דיווח:</strong> ${escaped.report_id}</p>
          <p><strong>שולח:</strong> ${escaped.sender_email}</p>
          <p><strong>ספר:</strong> ${escaped.book_title}</p>
          <p><strong>מיקום:</strong> ${escaped.current_ref}</p>
          <p><strong>שורה:</strong> ${escaped.line_number}</p>
          <p><strong>קובץ:</strong> ${escaped.file_name}</p>
          <p><strong>נתיב:</strong> ${escaped.file_path}</p>
          <p><strong>תיקיית מקור:</strong> ${escaped.source_folder}</p>
          <p><strong>נוצר בתאריך:</strong> ${escaped.created_at}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <h2 style="font-size: 18px; margin-bottom: 8px;">הטקסט המסומן</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.selected_text}</div>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">פירוט הטעות</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.error_details}</div>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">הקשר</h2>
          <div style="background: #faf7f2; border: 1px solid #eee2d2; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.context_text}</div>
          <h2 style="font-size: 18px; margin: 20px 0 8px;">Body גולמי</h2>
          <div style="background: #f3f3f3; border-radius: 10px; padding: 14px; white-space: pre-wrap;">${escaped.body}</div>
        </div>
      </div>
    </div>
  `;
}

function buildText(payload) {
  return [
    `מזהה דיווח: ${payload.report_id}`,
    `שולח: ${payload.sender_email}`,
    `ספר: ${payload.book_title}`,
    `מיקום: ${payload.current_ref}`,
    `שורה: ${payload.line_number}`,
    `קובץ: ${payload.file_name}`,
    `נתיב: ${payload.file_path}`,
    `תיקיית מקור: ${payload.source_folder}`,
    `נוצר בתאריך: ${payload.created_at}`,
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
    'Body גולמי:',
    payload.body,
  ].join('\n');
}

export async function POST(request) {
  try {
    const payload = await request.json();

    const validationError = validatePayload(payload);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const missingSmtp = ensureSmtpConfig();
    if (missingSmtp.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `השרת אינו מוגדר לשליחת מייל. חסרים משתני סביבה: ${missingSmtp.join(', ')}`,
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

    return NextResponse.json({
      success: true,
      message: 'הדיווח התקבל ונשלח בהצלחה',
      reportId: payload.report_id,
    });
  } catch (error) {
    console.error('Reporting errors API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'שגיאת שרת פנימית',
      },
      { status: 500 }
    );
  }
}