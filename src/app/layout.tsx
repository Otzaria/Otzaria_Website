import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css"; // <--- שורה זו קריטית! וודא שהיא קיימת
import SessionProvider from "@/components/SessionProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import VersionNotice from "@/components/VersionNotice";

const frankRuehl = localFont({
  src: "./fonts/FrankRuehlCLM-Medium.ttf",
  variable: "--font-frank-ruehl",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ספריית אוצריא",
  description: "פלטפורמה משותפת לעריכה ושיתוף של ספרי קודש",
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
      </head>
      <body className={`antialiased bg-background text-foreground font-sans ${frankRuehl.variable}`}>
        <ErrorBoundary>
          <SessionProvider>
            {children}
            <VersionNotice />
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}