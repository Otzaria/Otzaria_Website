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
          //  • script: עצמי + inline/eval (Next.js, PDF.js wasm)
          //  • style/font: עצמי + inline (Tailwind/framer-motion) + Google Fonts
          //  • img/media: כל HTTPS + data/blob (תמונות ספרים, OCR, canvas)
          //  • connect: כולל ws:/wss: עבור HMR/WebSocket של Next dev (ה-headers חלים גם בפיתוח)
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
              "connect-src 'self' https: ws: wss:",
              "frame-src 'self' https://nedar.im https://www.matara.pro",
              "worker-src 'self' blob:",
              // דף התרומות מטמיע את הווידג'ט של נדרים פלוס ב-iframe
              "frame-src 'self' https://nedar.im https://www.matara.pro",
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
