import type { Metadata } from "next";
import localFont from "next/font/local"; // ייבוא לטעינת פונט מקומי
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import ErrorBoundary from "@/components/ErrorBoundary";

// הגדרת הפונט המקומי - פרנק ריהל
// זה טוען את הפונט בזמן הבנייה, כך שהוא זמין מיד ומהר
const frankRuehl = localFont({
  src: "./fonts/FrankRuehlCLM-Medium.ttf", // וודא שהקובץ נמצא כאן
  variable: "--font-frank-ruehl", // משתנה CSS לשימוש ב-Tailwind
  display: "swap", // פותר את בעיית ה-font-display
});

export const metadata: Metadata = {
  title: "ספריית אוצריא",
  description: "פלטפורמה משותפת לעריכה ושיתוף של ספרי קודש",
  icons: {
    icon: "/logo.svg",
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
        {/* 
          תיקון לשגיאת גוגל פונטס: הוספנו &display=swap בסוף ה-URL.
          זה אומר לדפדפן להציג פונט ברירת מחדל עד שהאייקונים נטענים, במקום להסתיר טקסט.
        */}
        <link 
          rel="stylesheet" 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" 
        />
      </head>
      {/* הוספת המשתנה של הפונט ל-body כדי שיהיה זמין בכל האפליקציה */}
      <body className={`antialiased bg-background text-foreground font-sans ${frankRuehl.variable}`}>
        <ErrorBoundary>
          <SessionProvider>
            {children}
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}