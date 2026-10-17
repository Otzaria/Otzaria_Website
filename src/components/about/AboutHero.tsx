import Image from 'next/image'
import PageHeader from '@/components/ui/PageHeader'
import Section from '@/components/ui/Section'

/**
 * פתיחת דף האודות: הלוגו מעל כותרת העמוד (h1 + הקישוט) ושורת המשנה. בלי ריפוד תחתון — הרווח עד
 * האזור הבא הוא הריפוד העליון שלו (כמו /offline).
 * בלי אנימציית כניסה: הלוגו הוא אלמנט ה-LCP (אנימציה דחתה אותו בכ-0.6 שניות), ולכן גם eager +
 * עדיפות גבוהה (next/image טוען ברירת מחדל ב-lazy). alt ריק: הלוגו דקורטיבי ליד h1 שכבר אומר "אוצריא".
 */
export default function AboutHero({ titleId = 'about-title' }: { titleId?: string }) {
  return (
    <Section labelledBy={titleId} container="narrow" spacing="none" className="pt-10 md:pt-14 short:pt-8">
      <div className="mb-5 flex justify-center">
        <Image
          src="/logo.png"
          alt=""
          width={100}
          height={100}
          loading="eager"
          fetchPriority="high"
          className="size-20 md:size-24"
        />
      </div>
      <PageHeader id={titleId} title="אודות ספריית אוצריא" subtitle="פלטפורמה משותפת לעריכה ושיתוף של ספרי קודש" />
    </Section>
  )
}
