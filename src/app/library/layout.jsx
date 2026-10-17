import Footer from '@/components/layout/Footer'

export const metadata = {
  title: 'ספריית אוצריא',
  description: 'ניהול ועריכת ספרים',
}

/**
 * העוטף של כל דפי הספרייה. <div> ולא <main>: כל עמוד מצייר את הכותרת (Header) בעצמו,
 * ומיד אחריה <main id="main-content"> משלו. עוטף <main> כאן היה יוצר <main> מקונן,
 * ומכניס את הכותרת לתוך התוכן הראשי (ואז היא לא מזוהה כ-banner).
 */
export default function LibraryLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1">
        {children}
      </div>

      <Footer />
    </div>
  )
}
