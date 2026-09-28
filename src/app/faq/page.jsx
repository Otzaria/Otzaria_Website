import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import FaqListClient from './FaqListClient'

// רכיב שרת: רק רשימת השאלות (סינון + אקורדיון) רצה בדפדפן.
export default function FAQPage() {
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-primary mb-4 font-frank">
              שאלות נפוצות
            </h1>
            <p className="text-on-surface/70 text-lg">
              מענה לשאלות הנפוצות ביותר על תוכנת אוצריא
            </p>
          </div>

          <FaqListClient />
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
