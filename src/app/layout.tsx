import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; 
import SessionProvider from "@/components/SessionProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import VersionNotice from "@/components/VersionNotice";
import ReminderGuard from "@/components/ReminderGuard"; 
import { DialogProvider } from '@/components/DialogContext'
import { LoadingProvider } from '@/components/LoadingContext'


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
        <link 
          rel="stylesheet" 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" 
        />
        <script src="https://palmoni5.github.io/Shabbat-blocker/Shabbat-blocker.js"></script>
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