import Button from '@/components/ui/Button'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import DonateAnimatedIcon from '@/components/ui/icons/DonateAnimatedIcon'

// אזור הסיום של דף הבית: קריאה מכובדת לתרומה (במקום "הצטרפו לקהילת העורכים" שהוסר — הקהילה
// אינה פעילה). ממורכז ובנוי כמו שאר האזורים (כותרת + קישוט), עם אותו כפתור טונלי בצבע התרומה
// של הכותרת העליונה. בלי ריפוד תחתון — המרווח עד הפוטר הוא ה-mt של הפוטר עצמו.
export default function DonateCallout() {
  return (
    <Section labelledBy="donate-heading" spacing="top" container="narrow" containerClassName="flex flex-col items-center text-center">
      <SectionHeading
        id="donate-heading"
        title="אוצריא חינמית — בזכותך"
        subtitle="הפרויקט מתוחזק בהתנדבות, והתוכנה חינמית לחלוטין ותישאר כזו לעד. תרומתך עוזרת לנו לשלם על שרתים ולהמשיך לפתח את התוכנה."
        spacing="none"
        className="mb-6"
      />
      <Button
        href="/donate"
        variant="donation"
        size="lg"
        icon={<DonateAnimatedIcon strokeWidth={1.8} className="donation-button-icon donation-animated-icon" />}
      >
        לתרומה לאוצריא
      </Button>
    </Section>
  )
}
