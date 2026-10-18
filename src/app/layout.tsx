import type { Metadata } from "next";
import localFont from "next/font/local";
import { Assistant } from "next/font/google";
import "./globals.css"; 
import SessionProvider from "@/components/providers/SessionProvider";
import ErrorBoundary from "@/components/providers/ErrorBoundary";
import VersionNotice from "@/components/notifications/VersionNotice";
import ReminderGuard from "@/components/notifications/ReminderGuard"; 
import { DialogProvider } from '@/components/providers/DialogContext'
import { LoadingProvider } from '@/components/providers/LoadingContext'
import { ICON_FONT_URL } from '@/lib/icon-font'
import SkipLink from '@/components/layout/SkipLink'
import { OS_DETECT_SCRIPT } from '@/lib/detectOs'


// Frank Ruehl CLM (Culmus, GPL-2 עם חריג לגופנים) — גופן הכותרות של הדפים הישנים (font-frank).
// שני משקלים: Medium (500) לטקסט רגיל, ו-Bold (700) — כי כמעט כל השימושים הם font-bold. בלי
// Bold הדפדפן היה מייצר בולד מלאכותי מה-Medium (ובנוסף font-synthesis-weight: none על
// font-frank ב-typography.css). Bold נגזר מ-culmus-0.140 (OTF→TrueType, subset לאותם תווים
// כמו ה-Medium) — כ-18KB כל אחד.
// preload: false — הגופן משמש רק בדפים הישנים (הספרייה, חנות התוספים, מדריכים, תיבות דו-שיח),
// לא בדף הבית ולא בעמודים שעוצבו מחדש. preload ב-root layout חל על כל עמוד ומתחרה ב-LCP של
// דף הבית; בלעדיו הדפדפן מוריד רק את המשקל שטקסט מבקש בפועל (בדרך כלל רק Bold), ו-display: swap
// מציג קודם את גופן הנפילה.
const frankRuehl = localFont({
  src: [
    { path: "./fonts/FrankRuehlCLM-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/FrankRuehlCLM-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-frank-ruehl",
  display: "swap",
  preload: false,
});

// OT Vilna — Levi Chyrek / Otzar Fonts; התקבל אישור שימוש באתר.
// Regular (400) בלבד, בלי Bold — לכל הכותרות (font-display) ולשם המותג "אוצריא". קובץ ה-Bold
// נשאר ב-fonts/ אבל לא נטען. כדי שהדפדפן לא ייצר בולד מלאכותי (faux bold) אם משקל גבוה מתבקש
// בטעות — font-synthesis-weight: none על font-display (typography.css).
// אין בו אותיות לטיניות — הן נופלות ל---font-hebrew (typography.css).
// preload (ברירת המחדל) נשאר: שם האתר בכותרת העליונה משתמש בו בכל עמוד, ובדף הבית הוא
// גם הכותרת הראשית. כ-17KB. adjustFontFallback (ברירת המחדל, Arial מותאם-מידות) מצמצם
// את קפיצת ה-layout ברגע ההחלפה (display: swap).
const vilna = localFont({
  src: "./fonts/OTVilna-Regular.woff2",
  weight: "400",
  variable: "--font-vilna",
  display: "swap",
});

// Assistant — גופן הגוף והממשק בכל האתר (--font-sans / --font-hebrew ב-typography.css).
// גופן משתנה (200–800) — קובץ אחד לכל המשקלים. next/font מוריד אותו בזמן ה-build ומגיש
// אותו מהאתר עצמו (בלי בקשה ל-Google בזמן ריצה). Assistant נראה קטן מגופן המערכת באותו
// גודל — הפיצוי ב---font-body-size-adjust (typography.css), לא בגדלים עצמם.
//
// display: "optional" ולא "swap": גופן הממשק קובע את רוחב כל הטקסט, וההחלפה מגופן הגיבוי
// (Arial מותאם-מידות, שמותאם לאותיות לטיניות ולא לעבריות) הזיזה את כל קישורי הניווט בכותרת
// בכ-20px בביקור הראשון (נמדד ב-CDP). עם optional: הגופן מוקדם (preload), וכמעט תמיד מגיע
// לפני הציור הראשון; אם לא — העמוד הזה נשאר בגופן הגיבוי בלי להחליף באמצע, והבא כבר מהמטמון.
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-assistant",
  display: "optional",
});

export const metadata: Metadata = {
  title: "אוצריא",
  description: "פלטפורמה משותפת לעריכה ושיתוף",
  // האייקונים נקבעים על ידי app/icon.png ו-app/apple-icon.png (מוסיף Next hash
  // ו-cache ארוך). קודם הוגש כאן logo.svg — 1.68MB דחוסים כ-favicon.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // --font-assistant ו---font-frank-ruehl על <html> ולא על <body>: --font-sans/--font-hebrew ו---font-frank
  // (typography.css) הם טוקני @theme רגילים שמחושבים ב-:root, ושם המשתנה חייב כבר להיות מוגדר.
  // (--font-frank משמש גם כ-var() ישיר, למשל בבורר הגופן של עורך הגהת העמודים, ולכן לא די ב-inline.)
  // suppressHydrationWarning — רק בשביל data-os, שהסקריפט שלמטה מוסיף ל-<html> לפני ה-hydration
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${frankRuehl.variable}`} suppressHydrationWarning>
      <head>
        {/* זיהוי מערכת ההפעלה → <html data-os="windows|macos|mobile|other"> (lib/detectOs.js).
            ראשון ב-head ו-inline: רץ לפני הציור הראשון, ולכן CSS (למשל in-data-[os=macos]:...)
            מציג את מה שמתאים למערכת בלי קפיצה, והדף עצמו זהה לכולם (מטמון ציבורי).
            CSP: כרגע script-src כולל 'unsafe-inline'. אם יוסר בעתיד — להוסיף ל-script-src
            hash מסוג 'sha256-…' של OS_DETECT_SCRIPT (תוכן סטטי, ולכן hash יציב) */}
        <script dangerouslySetInnerHTML={{ __html: OS_DETECT_SCRIPT }} />
        {/* גופן האייקונים מוגש מקומית כ-subset (scripts/build-icon-font.mjs) ומוצהר
            ב-styles/icon-font.css. ה-preload מקדים את הבקשה לפרסור ה-CSS. */}
        <link rel="preload" href={ICON_FONT_URL} as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* חסימת שבת/יום טוב מתבצעת כעת בצד שרת ב-src/proxy.js (כולל מעבר חופשי לבוטים) */}
      </head>
      <body className={`antialiased bg-background text-foreground font-sans ${vilna.variable}`}>
        {/* הפריט הראשון בסדר ה-Tab בכל עמוד — מוסתר עד שמקבל פוקוס */}
        <SkipLink />
        <ErrorBoundary>
          <SessionProvider>
            <DialogProvider>
              <LoadingProvider>
                <ReminderGuard>
                  {children}
                </ReminderGuard>
                
                {/* חותם הדפלוי מוטמע בזמן build (next.config.ts) — חוסך בקשת
                    version.json בכל טעינת דף */}
                <VersionNotice deployVersion={process.env.DEPLOY_VERSION} />
              </LoadingProvider>
            </DialogProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
