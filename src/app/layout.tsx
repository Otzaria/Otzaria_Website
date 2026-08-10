import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; 
import SessionProvider from "@/components/providers/SessionProvider";
import ErrorBoundary from "@/components/providers/ErrorBoundary";
import VersionNotice from "@/components/notifications/VersionNotice";
import ReminderGuard from "@/components/notifications/ReminderGuard"; 
import { DialogProvider } from '@/components/providers/DialogContext'
import { LoadingProvider } from '@/components/providers/LoadingContext'
import { ICON_FONT_URL } from '@/lib/icon-font'


const frankRuehl = localFont({
  src: "./fonts/FrankRuehlCLM-Medium.woff2",
  variable: "--font-frank-ruehl",
  display: "swap",
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
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* גופן האייקונים מוגש מקומית כ-subset (scripts/build-icon-font.mjs) ומוצהר
            ב-styles/icon-font.css. ה-preload מקדים את הבקשה לפרסור ה-CSS. */}
        <link rel="preload" href={ICON_FONT_URL} as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* חסימת שבת/יום טוב מתבצעת כעת בצד שרת ב-src/proxy.js (כולל מעבר חופשי לבוטים) */}
      </head>
      <body className={`antialiased bg-background text-foreground font-sans ${frankRuehl.variable}`}>
        <ErrorBoundary>
          <SessionProvider>
            <DialogProvider>
              <LoadingProvider>
                <ReminderGuard>
                  {children}
                </ReminderGuard>
                
                <VersionNotice />
              </LoadingProvider>
            </DialogProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
