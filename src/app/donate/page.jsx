'use client'

import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="py-12 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold text-primary mb-6 font-frank">
            תרומה לאוצריא
          </h1>
          
          <div className="glass-strong p-8 rounded-2xl border border-neutral-200 bg-white">
            <span className="material-symbols-outlined text-7xl text-primary mb-4 block">
              volunteer_activism
            </span>
            <p className="text-xl text-neutral-700 mb-4">
              הפרויקט מתוחזק בהתנדבות. תרומתכם עוזרת לנו לשלם על שרתים ולהמשיך לפתח את התוכנה.
            </p>
            <p className="text-lg text-neutral-600 mb-8">
              התרומה באמצעות נדרים פלוס
            </p>
            
            <div className="mt-8">
              <iframe 
                src="https://nedar.im/ezOd" 
                style={{width: '100%', height: '1700px', border: 'none'}} 
                title="Nedarim Plus Widget"
              />
            </div>
          </div>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
