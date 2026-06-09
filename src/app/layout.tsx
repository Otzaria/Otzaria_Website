import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; 
import SessionProvider from "@/components/providers/SessionProvider";
import ErrorBoundary from "@/components/providers/ErrorBoundary";
import VersionNotice from "@/components/notifications/VersionNotice";
import ReminderGuard from "@/components/notifications/ReminderGuard"; 
import { DialogProvider } from '@/components/providers/DialogContext'
import { LoadingProvider } from '@/components/providers/LoadingContext'


const frankRuehl = localFont({
  src: "./fonts/FrankRuehlCLM-Medium.ttf",
  variable: "--font-frank-ruehl",
  display: "swap",
});

export const metadata: Metadata = {
  title: "אוצריא",
  description: "פלטפורמה משותפת לעריכה ושיתוף",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/logo.svg"],
    apple: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* גופן אייקונים (Material Symbols) — next/font אינו מתאים לגופן אייקונים דינמי */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
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
