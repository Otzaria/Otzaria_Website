import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import AboutLinkCard from './AboutLinkCard'

/**
 * "תנאי השימוש במאגר": עיקר התנאים בשורת המשנה, הערה (פרטי הרישיון באתר ספריא), ושני כרטיסי
 * קישור לרישיונות.
 */
export default function LicenseTermsSection() {
  return (
    <Section labelledBy="terms-heading" spacing="top" container="narrow">
      {/* הפסקה מחוץ ל-subtitle של SectionHeading: שם text-balance, והוא שובר את הקטע המודגש באמצעו.
          אותו מראה ואותו רווח כמו שורת משנה (mt-4 / mb-8 md:mb-10), בלי האיזון */}
      <SectionHeading id="terms-heading" title="תנאי השימוש במאגר" spacing="none" />
      <p className="mx-auto mt-4 mb-8 max-w-measure text-center text-base text-on-surface-variant md:mb-10 md:text-lg">
        הטקסטים ניתנים לשימוש חופשי, עם זאת <strong className="font-bold text-on-surface">חלק מהטקסטים ניתנים ברישיון שאינו מאפשר שימוש מסחרי</strong>.
      </p>
      <Card tone="tonal" padding="sm" role="note" className="mb-3 flex items-center gap-3 sm:mb-4">
        <AppIcon name="info" className="shrink-0 text-2xl text-primary" />
        <p className="min-w-0 text-body-md text-on-surface">ניתן לראות את פרטי הרישיון לכל טקסט באתר ספריא</p>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <li className="flex">
          <AboutLinkCard href="/license" icon="description">לרישיון התוכנה</AboutLinkCard>
        </li>
        <li className="flex">
          <AboutLinkCard href="/library/license" icon="auto_stories">לרישיון הספרים הערוכים בספריית אוצריא</AboutLinkCard>
        </li>
      </ul>
    </Section>
  )
}
