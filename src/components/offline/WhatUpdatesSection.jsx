import IconTile from '@/components/ui/IconTile'
import InfoCard from '@/components/ui/InfoCard'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'

const MODULES = [
  {
    icon: 'system_update_alt',
    title: 'תוכנת אוצריא',
    text: 'הכלי מזהה את הגרסה שמותקנת אצלך, ומתקין או מעדכן את אוצריא מתוך הכונן.'
  },
  {
    icon: 'library_books',
    title: 'ספריית הספרים',
    text: 'בהורדה הראשונה הכלי שומר על הכונן את הספרייה המלאה, ובהמשך בדרך כלל רק קובצי עדכון. את קובצי החיפוש החכם הוא מוריד רק אם תבחר בכך.'
  },
  {
    icon: 'extension',
    title: 'תוספים',
    text: 'חנות תוספים שעובדת בלי אינטרנט. הקטלוג מועתק מהאתר אל הכונן, ומשם תתקין תוספים ישר לתוך אוצריא.'
  }
]

const EXTRAS = [
  {
    icon: 'install_desktop',
    title: 'התקנה מלאה',
    text: 'כברירת מחדל הכלי מוריד לכונן גם את הספרייה המלאה, וכך אפשר להתקין ממנו את אוצריא ואת הספרייה במחשב שאוצריא עוד לא מותקנת בו. אם הכונן משמש רק את המחשב שלך, אפשר להגדיר שהכלי יוריד רק קובצי עדכון.'
  },
  {
    icon: 'autorenew',
    title: 'עדכון אוטומטי',
    text: 'אפשר להגדיר שבכל פתיחה של הכלי הוא יעדכן מהכונן את אוצריא ואת הספרייה שכבר מותקנות, בלי לבקש אישור (אם אוצריא סגורה). ההגדרה כבויה כברירת מחדל.'
  },
  {
    icon: 'apps',
    title: 'תוכנות נוספות',
    text: 'רוצה להעביר גם תוכנות אחרות משלך? הוסף אותן לכונן, והן יעברו יחד עם העדכונים.'
  },
  {
    icon: 'flag',
    title: 'דיווחי טעויות',
    text: 'דיווחים על טעויות בספרים, בתוכנה ובתוספים, שלא נשלחו מהמחשב הלא-מקוון, נאספים באישורך ונשלחים אחר כך מהמחשב המחובר.'
  }
]

// שלושת הרכיבים המרכזיים ככרטיסים, ו"ועוד" — יכולות משניות כרשימה שקטה, בלי משטח (שתיים בשורה)
export default function WhatUpdatesSection() {
  return (
    <Section labelledBy="updates-heading">
      <SectionHeading id="updates-heading" title="מה הכלי מעדכן" />
      <ul className="grid gap-3 sm:gap-4 md:grid-cols-3">
        {MODULES.map((item) => (
          <InfoCard key={item.title} as="li" className="h-full" icon={item.icon} title={item.title}>{item.text}</InfoCard>
        ))}
      </ul>

      <div className="mt-8 md:mt-10">
        <h3 className="mb-4 text-center text-title-md text-on-surface">ועוד</h3>
        <ul className="grid gap-4 md:grid-cols-2 md:gap-8">
          {EXTRAS.map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <IconTile icon={item.icon} size="sm" />
              <div className="min-w-0">
                <h4 className="text-title-sm text-on-surface">{item.title}</h4>
                <p className="mt-0.5 text-body-sm text-on-surface-variant">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
