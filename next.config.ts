/** @type {import('next').NextConfig} */
const nextConfig = {
  // הסרת חשיפת טכנולוגיית השרת (ZAP: Server Leaks Information via X-Powered-By)
  poweredByHeader: false,
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    proxyClientMaxBodySize: '500mb',
  },
  images: {
    // unoptimized: true היה מוגדר כאן גלובלית, ולכן גם <Image width={32}> שלח את
    // קובץ המקור בגודלו המלא. עכשיו Next מקטין וממיר ל-WebP כל תמונה מקומית —
    // כולל תמונות ממוזערות של ספרים מ-/uploads, שהן סריקות עמוד שלמות.
    //
    // remotePatterns הכיל hostname: '**'. בשילוב עם אופטימיזציה פעילה זה הופך את
    // /_next/image ל-proxy תמונות פתוח לכל דומיין, ולכן צומצם לדומיין של האתר.
    // תמונות חיצוניות (למשל צילומי מסך של תוספים) מוצגות ב-<img> רגיל ואינן
    // עוברות דרך המאופטמייזר.
    remotePatterns: [
      { protocol: 'https', hostname: 'otzaria.org' },
      { protocol: 'https', hostname: 'www.otzaria.org' },
    ],
  },
  
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/uploads/:path*',
          destination: 'https://otzaria.org/uploads/:path*',
        },
      ];
    }
    return [];
  },

  async redirects() {
    return [
      {
        source: '/library/dicta-books/editingtools',
        destination: '/library/editingtools',
        permanent: true,
      },
      // המדריך הישן הוחלף במדריך הדינמי מהוויקי
      {
        source: '/docs/installation',
        destination: '/docs/getting-started',
        permanent: true,
      },
      // דף ההתחברות עבר מהספרייה לנתיב כללי (פרמטרי ה-query, כולל callbackUrl, נשמרים אוטומטית)
      {
        source: '/library/auth/login',
        destination: '/auth/login',
        permanent: true,
      },
    ];
  },

  // כותרות אבטחה (מטפל בממצאי ZAP: clickjacking, content-type sniffing, referrer, HSTS)
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    // ב-dev בלבד נדרש 'unsafe-eval' עבור ה-HMR של Next. בפרודקשן מספיק 'wasm-unsafe-eval'
    // (עיבוד ה-PDF רץ בצד שרת ולכן הדפדפן אינו זקוק ל-eval מלא).
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
    return [
      {
        source: '/:path*',
        headers: [
          // מניעת הטמעה ב-iframe (anti-clickjacking)
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // מניעת ניחוש סוג תוכן
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // לא לדלוף נתיב מלא ב-Referer לאתרים חיצוניים
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // צמצום הרשאות דפדפן שאינן בשימוש
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // אכיפת HTTPS. ללא includeSubDomains/preload בכוונה — אלו התחייבויות דפלוימנט
          // כבדות (preload = רשימת ה-preload, ביטול לוקח חודשים; includeSubDomains שובר
          // תת-דומיין שאינו HTTPS). הוסף אותם ידנית רק כשכל תתי-הדומיינים מוכנים ל-HTTPS קבוע.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          // Content-Security-Policy — מותאם למקורות שהאתר משתמש בהם בפועל:
          //  • script: עצמי + inline/wasm (Next.js, PDF.js). 'unsafe-inline' נשאר
          //    זמנית — הסרתו דורש מעבר ל-nonce בכל העמודים (TODO ארכיטקטוני)
          //  • style/font: עצמי + inline (Tailwind/framer-motion) + Google Fonts
          //  • img/media: עצמי + data/blob. התו הכללי https: הוסר מ-connect-src,
          //    נותר זמנית ב-img/media (תמונות/שמע של ספרים מגיעות ממארחים
          //    משתנים) — יש לצמצם כאשר רשימת המארחים תתייצב
          //  • connect: מצומצם ל-self + GitHub API (releases/תוספים) + ws:/wss: ל-HMR
          //  • frame: ווידג'ט התרומות של נדרים פלוס (הקישור הקצר מפנה ל-matara.pro)
          //  • frame-ancestors 'self': anti-clickjacking
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https:",
              // connect-src מצומצם למקורות בשימוש מוכח בצד הלקוח: GitHub API
              // (github-releases/editingtools/Link-Notes). הוסר התו הכללי https:
              // שאפשר ל-XSS להדליף נתוני משתמשים לכל שרת שהוא.
              "connect-src 'self' blob: https://api.github.com https://raw.githubusercontent.com ws: wss:",
              // דף התרומות מטמיע את הווידג'ט של נדרים פלוס ב-iframe
              "frame-src 'self' https://nedar.im https://www.matara.pro",
              "worker-src 'self' blob:",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        // גופנים ב-public/fonts ממוספרים ב-hash תוכן (scripts/build-icon-font.mjs),
        // ולכן אפשר לשמור אותם לשנה כ-immutable. שינוי גופן משנה את שם הקובץ.
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // חותם הגרסה של הדפלוי — VersionNotice מסתמך עליו לזיהוי עדכון, ולכן
        // אסור שייענה מתוך מטמון (של הדפדפן או של ה-CDN).
        source: '/version.json',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
      // אייקוני האתר. Next מגיש אותם כברירת מחדל עם max-age=0, must-revalidate,
      // כלומר סבב אימות בכל טעינת דף — למרות שה-URL כולל hash של התוכן.
      ...['/icon.png', '/apple-icon.png'].map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=604800' },
        ],
      })),
      // נכסי תמונה קבועים ב-public (נוצרים ב-scripts/optimize-assets.mjs). שמם אינו
      // ממוספר ב-hash — הם מוטמעים גם במיילים וב-HTML של דף השבת — ולכן חודש
      // במקום שנה, עם stale-while-revalidate כדי שהחלפה תתפוס בלי המתנה.
      ...['/bg.avif', '/bg.webp', '/logo.webp', '/logo.png'].map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=604800' },
        ],
      })),
    ];
  },
};

export default nextConfig;
