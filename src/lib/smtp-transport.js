import nodemailer from 'nodemailer';

/**
 * smtp-transport — יצירת transporter משותף לכל שליחות המייל באתר
 * (reportingerrors, forgot-password, verify/send, send-email,
 * send-dicta-sync-notification ו-emailService), כדי שמדיניות TLS והגדרות
 * החיבור יהיו אחידות ולא נעתקו מקומית בכל route.
 *
 * ⚠️ שינוי אבטחה: בגרסאות קודמות חלק מהroutes שלחו עם
 * `tls.rejectUnauthorized: false` — מה שמאפשר ל-MITM ליירט פרטי SMTP ותוכן
 * מייל רגיש. מעכשיו ברירת המחדל היא אימות מלא של תעודת השרת.
 * אם שרת ה-SMTP משתמש בתעודה עצמית-חתומה, הגדירו ב-.env:
 *     SMTP_TLS_REJECT_UNAUTHORIZED=false
 */
function buildTransportOptions(extraOptions = {}) {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
    // timeouts כדי ש-SMTP תקוע לא יחזיק handlers/שרשורים בזמן בלתי-מוגבל
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    ...extraOptions,
  };
}

// transporter חד-פעמי לכל שליחה (ברירת המחדל)
export function createSmtpTransport() {
  return nodemailer.createTransport(buildTransportOptions());
}

// Transporter מאוגד (pool: true) לשליחה לרשימת נמענים — חוסך handshake חוזר
// עבור כל נמען. transporters מוחזקים ב-cache לפי label; הקריאה אידמפוטנטית.
// מיועד לנתיבי broadcast (רשימות תפוצה), לא לשליחות בודדות.
const pooledTransports = new Map();

export function createCustomSmtpTransport(label = 'default') {
  const key = String(label || 'default').slice(0, 50);
  if (!pooledTransports.has(key)) {
    pooledTransports.set(
      key,
      nodemailer.createTransport(
        buildTransportOptions({
          pool: true,
          maxConnections: 3,
          maxMessages: 100,
        })
      )
    );
  }
  return pooledTransports.get(key);
}