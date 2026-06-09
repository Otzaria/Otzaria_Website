import Footer from '@/components/layout/Footer'

export const metadata = {
  title: 'ספריית אוצריא',
  description: 'ניהול ועריכת ספרים',
}

export default function LibraryLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header יוצג בכל דפי הספרייה */}
      {/* <Header /> כבר נמצא בתוך הדפים הספציפיים בקוד המקורי, 
          אך עדיף שיהיה כאן אם רוצים אותו בכל הספרייה. 
          לבינתיים נשאיר אותו בדפים כדי לא לשבור עיצוב קיים. */}
      
      <main className="flex-1">
        {children}
      </main>
      
      <Footer />
    </div>
  )
}
