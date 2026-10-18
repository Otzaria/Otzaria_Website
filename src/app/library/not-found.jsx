import Header from '@/components/layout/Header'
import NotFoundContent from '@/components/notFound/NotFoundContent'

export const metadata = {
  title: 'הדף לא נמצא | ספריית אוצריא',
  robots: { index: false, follow: true }
}

// 404 בתוך הספרייה (notFound() מדף תחת /library): הכותרת של הספרייה ו-<main> משלו;
// הפוטר מגיע מ-library/layout.jsx (שעוטף ב-<div> ולא ב-<main>). התוכן — אותו רכיב כמו
// בדף הכללי, עם סדר דרכי המשך של הספרייה.
export default function LibraryNotFound() {
  return (
    // בלי min-h-screen: העוטף של הספרייה כבר ממלא את המסך, והפוטר שלו בא אחרינו
    <div className="flex flex-col overflow-x-clip text-on-surface">
      <Header />

      <main id="main-content" className="flex flex-1 flex-col">
        <NotFoundContent context="library" />
      </main>
    </div>
  )
}
