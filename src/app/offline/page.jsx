import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import DonateCallout from '@/components/home/DonateCallout'
import GoodToKnowSection from '@/components/offline/GoodToKnowSection'
import HowItWorksSection from '@/components/offline/HowItWorksSection'
import OfflineUpdateDownload from '@/components/offline/OfflineUpdateDownload'
import WhatUpdatesSection from '@/components/offline/WhatUpdatesSection'
import IconTile from '@/components/ui/IconTile'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'

export const metadata = {
  title: 'עדכוני אוצריא – עדכון במחשב לא-מקוון | אוצריא',
  description:
    'כלי קטן לעדכון אוצריא, ספריית הספרים והתוספים במחשב בלי אינטרנט. הורד במחשב מחובר אל כונן USB, ועדכן מהכונן. ל-Windows ול-macOS.'
}

const REPO_URL = 'https://github.com/Otzaria/Otzaria_Offline_update'

// עיצוב כיוון א' (כמו דף הבית): כותרת + קישוט, ומיד מתחתיה ההורדה — הפעולה הראשית של הדף
// נראית במסך הראשון. אחריה: איך זה עובד, מה מתעדכן, שאלות קצרות, ותרומה בסיום.
export default function OfflineUpdatePage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        {/* בלי אנימציית כניסה: הכותרת היא אלמנט ה-LCP. בלי ריפוד תחתון — הרווח עד האזור הבא
            הוא הריפוד העליון שלו, כדי שההורדה ו"איך זה עובד" לא יתרחקו זה מזה */}
        <Section id="download" labelledBy="offline-title" anchor container="narrow" spacing="none" className="pt-10 md:pt-14 short:pt-8">
          <div className="mb-4 flex justify-center">
            <IconTile icon="cloud_off" size="lg" />
          </div>
          <PageHeader
            id="offline-title"
            title="עדכוני אוצריא"
            subtitle="לומד באוצריא במחשב בלי אינטרנט? הורד את העדכונים במחשב מחובר אל כונן USB, ועדכן מהכונן את התוכנה, את הספרייה ואת התוספים."
            className="short:mb-6"
          />
          <OfflineUpdateDownload repoUrl={REPO_URL} />
        </Section>

        <HowItWorksSection />

        <WhatUpdatesSection />

        <GoodToKnowSection repoUrl={REPO_URL} />

        <DonateCallout />
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
