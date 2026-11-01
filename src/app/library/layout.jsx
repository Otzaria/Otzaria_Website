import Footer from '@/components/layout/Footer'
import LibraryChrome from '@/components/layout/LibraryChrome'

// בלי noindex כאן: תחת /library יש גם דפים ציבוריים (ראו STATIC_PATHS ב-sitemapEntries.js).
export const metadata = {
  title: 'ספריית אוצריא',
  description: 'עריכה משותפת של ספרי קודש לספריית אוצריא.',
}

/**
 * העוטף של כל דפי הספרייה. <div> ולא <main>: כל עמוד מצייר את הכותרת (Header) בעצמו,
 * ומיד אחריה <main id="main-content"> משלו. עוטף <main> כאן היה יוצר <main> מקונן,
 * ומכניס את הכותרת לתוך התוכן הראשי (ואז היא לא מזוהה כ-banner).
 */
export default function LibraryLayout({ children }) {
  // בעורך העמוד — בלי הפוטר (LibraryChrome)
  return <LibraryChrome footer={<Footer />}>{children}</LibraryChrome>
}
