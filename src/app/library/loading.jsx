import LoadingSpinner from '@/components/ui/LoadingSpinner'

/**
 * fallback מיידי למעברים בתוך הספרייה.
 *
 * בלי loading.jsx, מעבר למסלול שנרנדר בשרת משאיר את הדף הקודם על המסך עד
 * שהתשובה חוזרת — ברשת איטית זה נראה כאילו הלחיצה לא נרשמה.
 */
export default function LibraryLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner message="טוען..." size="lg" />
    </div>
  )
}
