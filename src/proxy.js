import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { hasAnyAdminAccess } from '@/lib/roles';

// ===== חסימת שבת/יום טוב בצד שרת =====
// הלוגיקה הועברה מסקריפט צד-לקוח (Shabbat-blocker.js):
// - הבדיקה רצה בשרת לפני הצביעה, כך שאי אפשר לעקוף אותה בכיבוי JS.
// - בוטים (גוגל, בינג וכו') אינם נחסמים, כדי לא לפגוע בסריקה ובאינדוקס (SEO).
// - תוצאת ה-API נשמרת במטמון בזיכרון לזמן קצר כדי לא להעמיס על Hebcal.

// כתובת ה-API של Hebcal עבור ירושלים (geonameid=281184), עם שעון ישראל (im=1).
const HEBCAL_URL = 'https://www.hebcal.com/zmanim?cfg=json&im=1&geonameid=281184';

// משך תוקף המטמון בזיכרון (מילישניות). שומר על תגובתיות סביב כניסת/צאת שבת.
const CACHE_TTL_MS = 60_000;

// מטמון שלילי קצר על כשל — מונע הצפת Hebcal בקריאות חוזרות בזמן תקלה.
const ERROR_CACHE_TTL_MS = 30_000;

// timeout לקריאה ל-Hebcal — שלא בקשה תיתקע אם השירות איטי/נפל.
const FETCH_TIMEOUT_MS = 2_500;

// זיהוי בוטים נפוצים — מנועי חיפוש ורשתות חברתיות. אלו לא נחסמים.
const BOT_REGEX =
  /bot|crawl|spider|slurp|googlebot|bingbot|duckduckbot|baiduspider|yandex|applebot|petalbot|ahrefs|semrush|facebookexternalhit|twitterbot|whatsapp|telegram|linkedinbot|embedly|preview|lighthouse|google-inspectiontool/i;

const BLOCK_MESSAGE = 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים';

// נתיבי API תשתיתיים שאינם "שימוש אנושי באתר" ולכן אינם נחסמים בשבת:
// job-ים מתוזמנים (cron) ואימות (NextAuth) חייבים להמשיך לעבוד.
const SHABBAT_API_EXEMPT = ['/api/cron', '/api/auth'];

// ⚠️ זמני לבדיקה בלבד — מכריח חסימה גם כשזו לא שבת. החזר ל-false לפני העלאה!
const FORCE_BLOCK_FOR_TESTING = false;

// מטמון מודולרי — נשמר בין בקשות באותו תהליך/isolate.
let shabbatCache = null;

/**
 * בודק מול Hebcal האם כעת אסור במלאכה (שבת או יום טוב).
 * נכשל "פתוח" (false) במקרה של שגיאה, בדיוק כמו הסקריפט המקורי.
 */
async function isAssurBemlacha() {
  if (FORCE_BLOCK_FOR_TESTING) return true; // ⚠️ זמני — הסר לפני העלאה
  const now = Date.now();
  if (shabbatCache && shabbatCache.expires > now) return shabbatCache.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(HEBCAL_URL, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const value = data?.status?.isAssurBemlacha === true;
    shabbatCache = { value, expires: now + CACHE_TTL_MS };
    return value;
  } catch {
    // לא הצלחנו לברר (timeout/שגיאה) — לא חוסמים, ושומרים במטמון שלילי קצר
    // כדי לא לקרוא ל-Hebcal בכל בקשה בזמן תקלה.
    shabbatCache = { value: false, expires: now + ERROR_CACHE_TTL_MS };
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function blockResponse() {
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>אוצריא — שומר שבת</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&family=Secular+One&display=swap" rel="stylesheet" />
<style>
  html,body{margin:0;height:100%}
  body{height:100dvh;overflow:hidden;display:flex;justify-content:center;
       background-color:#fdfdfd;direction:rtl;text-align:center;
       font-family:'Heebo',Arial,sans-serif}
  .shabbat-content{max-width:1000px;width:100%;height:100%;background:#ffffff;
       padding:40px;box-sizing:border-box;
       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
       box-shadow:0 10px 40px rgba(0,0,0,0.08)}
  .shabbat-logo{flex:none;height:clamp(80px,15vh,150px);object-fit:contain}
  .shabbat-title{flex:none;margin:0;font-size:clamp(3rem,10vw,8rem);font-weight:700;color:#333;
       font-family:'Secular One','Heebo',sans-serif}
  .shabbat-image{flex:1 1 auto;min-height:0;max-width:80%;object-fit:contain;border-radius:10px}
</style>
</head>
<body>
  <div class="shabbat-content">
    <img src="/logo.webp" alt="לוגו אוצריא" class="shabbat-logo" />
    <h1 class="shabbat-title">שבת היום לה'</h1>
    <img src="/shabbat/sabbath.png" alt="שבת שלום" class="shabbat-image" />
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // לא לשמור במטמון — כדי שהחסימה תוסר מיד בצאת השבת.
      'cache-control': 'no-store, must-revalidate',
      'retry-after': '3600',
    },
  });
}

// דחיית בקשות API בשבת — JSON במקום HTML.
function blockResponseJson() {
  return NextResponse.json(
    { error: 'shabbat', message: BLOCK_MESSAGE },
    {
      status: 503,
      headers: {
        'cache-control': 'no-store, must-revalidate',
        'retry-after': '3600',
      },
    }
  );
}

// ===== הרשאות (לוגיקה קיימת) =====

// נתיבי דפים המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_PAGES = [
  '/library/admin/plugins',
  '/library/admin/messages',
];
const PLUGINS_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];

// נתיבי API המותרים לכל מנהל תוספים
const PLUGINS_ADMIN_ALLOWED_API = [
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  // סידור חנות התוספים: קטגוריות, הגדרות דף הבית (נבחרים) ורשימת הלא-משוכנים
  '/api/admin/plugin-categories',
  '/api/admin/store-settings',
  '/api/admin/plugin-store',
  '/api/admin/users-basic',
  '/api/admin/stats',
];

// ===== מנהל ספרים-בלבד =====
// גישה אך ורק לעמוד ניהול הספרים (/library/admin/books) ולדשבורד, ולנתיבי ה-API
// המשרתים אותם. כל שאר נתיבי /library/admin ו-/api/admin חסומים (דיקטה, העלאות,
// עמודים, מילון, מידע/כינויים, משתמשים, תוספים וכו').
const BOOKS_ONLY_ADMIN_ALLOWED_PAGES = [
  '/library/admin/books',
];
const BOOKS_ONLY_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];
const BOOKS_ONLY_ADMIN_ALLOWED_API = [
  '/api/admin/books',
  '/api/admin/categories',
  '/api/admin/mailing-list',
  '/api/admin/book-statuses',
  '/api/admin/stats',
];

// ===== מנהל OCR =====
// גישה אך ורק לשלושת אזורי הניהול של ה-OCR (מאגר אימון, תמלול שורות, תיוג
// מבנה עמוד) ולדשבורד, ולנתיבי ה-API המשרתים אותם. כל שאר /library/admin
// ו-/api/admin חסומים.
const OCR_ADMIN_ALLOWED_PAGES = [
  '/library/admin/ocr-training',
  '/library/admin/ocr-lines',
  '/library/admin/ocr-layout',
];
const OCR_ADMIN_ALLOWED_PAGE_EXACT = ['/library/admin'];
const OCR_ADMIN_ALLOWED_API = [
  '/api/admin/ocr-training',
  '/api/admin/ocr-lines',
  '/api/admin/ocr-layout',
  '/api/admin/stats',
];

// נתיבי דפים/API החסומים למנהל ספרים (אזורי ה-OCR — למנהל גלובלי ולמנהל OCR בלבד)
const BOOKS_ADMIN_BLOCKED_PAGES = [
  '/library/admin/users',
  '/library/admin/plugins',
  '/library/admin/ocr-training',
  '/library/admin/ocr-lines',
  '/library/admin/ocr-layout',
];
const BOOKS_ADMIN_BLOCKED_API = [
  '/api/admin/users',
  '/api/admin/plugins',
  '/api/admin/plugin-notifications',
  '/api/admin/plugin-categories',
  '/api/admin/store-settings',
  '/api/admin/plugin-store',
  '/api/admin/export-backup',
  '/api/admin/ocr-training',
  '/api/admin/ocr-lines',
  '/api/admin/ocr-layout',
];

// נתיבים הדורשים אימות (קבוצת ה-matcher המקורית של ההרשאות).
// רק עליהם נכפה התחברות; שאר הדפים ציבוריים (ועוברים רק בדיקת שבת).
const PROTECTED_PREFIXES = [
  '/plugins/upload',
  '/library/dashboard',
  '/library/admin',
  '/library/upload',
  '/library/books',
  '/library/book',
  '/library/edit',
  '/library/users',
  '/library/info',
  '/library/acronyms',
  '/library/dicta-books',
  '/library/ocr-training',
  '/library/ocr-lines',
  '/api/admin',
  '/api/ocr-training',
  '/api/ocr-lines',
  '/api/library/book-info',
  '/api/library/book-acronyms',
  '/api/upload-text',
];

const isProtectedPath = (path) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

const authProxy = withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Redirects מהנתיבים הישנים לחדשים
    // /library/book/* -> /library/books/*
    if (path.startsWith('/library/book/')) {
      const newPath = path.replace('/library/book/', '/library/books/');
      return NextResponse.redirect(new URL(newPath, req.url));
    }

    // /library/edit/* -> /library/books/*
    if (path.startsWith('/library/edit/')) {
      const newPath = path.replace('/library/edit/', '/library/books/');
      return NextResponse.redirect(new URL(newPath, req.url));
    }

    // הגנה על דפי ו-API של ניהול
    if (path.startsWith('/library/admin') || path.startsWith('/api/admin')) {
      if (!token) return NextResponse.next();

      const role = token.role;
      const isApiRoute = path.startsWith('/api/');

      const unauthorized = () =>
        isApiRoute
          ? NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
          : NextResponse.redirect(new URL('/library/unauthorized', req.url));

      // לא מנהל בכלל
      if (!hasAnyAdminAccess(role)) return unauthorized();

      // מנהל תוספים - dashboard, plugins ו-messages
      if (role === 'admin_plugins') {
        const allowed = isApiRoute
          ? PLUGINS_ADMIN_ALLOWED_API.some(p => path.startsWith(p))
          : PLUGINS_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || PLUGINS_ADMIN_ALLOWED_PAGES.some(p => path.startsWith(p));
        if (!allowed) return unauthorized();
      }

      // מנהל ספרים-בלבד - דשבורד + ניהול ספרים בלבד (allowlist)
      if (role === 'admin_books_only') {
        const allowed = isApiRoute
          ? BOOKS_ONLY_ADMIN_ALLOWED_API.some(p => path === p || path.startsWith(p + '/'))
          : BOOKS_ONLY_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || BOOKS_ONLY_ADMIN_ALLOWED_PAGES.some(p => path === p || path.startsWith(p + '/'));
        if (!allowed) return unauthorized();
      }

      // מנהל OCR - דשבורד + שלושת אזורי ה-OCR בלבד (allowlist)
      if (role === 'admin_ocr') {
        const allowed = isApiRoute
          ? OCR_ADMIN_ALLOWED_API.some(p => path === p || path.startsWith(p + '/'))
          : OCR_ADMIN_ALLOWED_PAGE_EXACT.includes(path) || OCR_ADMIN_ALLOWED_PAGES.some(p => path === p || path.startsWith(p + '/'));
        if (!allowed) return unauthorized();
      }

      // מנהל ספרים - הכל חוץ ממשתמשים ותוספים
      if (role === 'admin_books') {
        const isBlocked = (list) => list.some(p => path === p || path.startsWith(p + '/'));
        const blocked = isApiRoute
          ? isBlocked(BOOKS_ADMIN_BLOCKED_API)
          : isBlocked(BOOKS_ADMIN_BLOCKED_PAGES);
        if (blocked) return unauthorized();
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // רק הנתיבים המוגנים דורשים אימות; שאר הדפים ציבוריים.
        return isProtectedPath(req.nextUrl.pathname) ? !!token : true;
      }
    },
    pages: {
      signIn: '/library/auth/login',
    }
  }
);

export default async function proxy(req, event) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith('/api');

  // נתיבי API תשתיתיים (cron/auth) אינם נחסמים בשבת.
  const apiExempt =
    isApi && SHABBAT_API_EXEMPT.some((p) => path === p || path.startsWith(p + '/'));

  // חסימת שבת/יום טוב — לכל הדפים וה-API, פרט לבוטים ולנתיבי תשתית מוחרגים.
  // דפים מקבלים HTML, ו-API מקבל JSON של דחייה.
  const ua = req.headers.get('user-agent') ?? '';
  if (!apiExempt && !BOT_REGEX.test(ua) && await isAssurBemlacha()) {
    return isApi ? blockResponseJson() : blockResponse();
  }

  // העברה ללוגיקת ההרשאות הקיימת.
  return authProxy(req, event);
}

export const config = {
  matcher: [
    // כל הדפים (חסימת שבת בתור HTML) — פרט ל-API, נכסי Next סטטיים, favicon וקבצים עם סיומת.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    // כל ה-API — חסימת שבת מחזירה JSON; הרשאות חלות על הנתיבים המוגנים בלבד.
    '/api/:path*',
  ]
};
