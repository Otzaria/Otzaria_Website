import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'
import NewWindowHint from '@/components/ui/NewWindowHint'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'

// מונחים לועזיים עם מספרים — בבידוד (bdi), אחרת "10 / 11" מתהפך בשורה עברית
const ITEMS = [
  {
    q: 'מה צריך כדי להשתמש בכלי?',
    a: (
      <>
        מחשב <Ltr>Windows 10 / 11</Ltr> (64 סיביות) או <Ltr>macOS 10.15</Ltr> ומעלה, וכונן USB עם
        מקום פנוי. הכלי בודק שיש מספיק מקום לפני ההורדה. הממשק בעברית ובאנגלית.
      </>
    )
  },
  {
    q: 'צריך להתקין אותו?',
    a: 'לא. ב-Windows זה קובץ אחד שאתה מפעיל ישירות. ב-macOS פתח את קובץ ה-zip והפעל את היישום. בדרך כלל לא צריך הרשאות מנהל. שמור את הכלי על הכונן: העדכונים נשמרים בתיקייה OtzariaData שלצדו.'
  },
  {
    q: 'האם העדכון בטוח?',
    a: 'שום דבר לא יורד בלי אישורך, וגם ההתקנה מחכה לאישורך, אלא אם הפעלת עדכון אוטומטי. כל קובץ עדכון נבדק לפני שהוא מוחל, והספרייה הקיימת נשארת שלמה עד שהעדכון מסתיים. אם ההורדה נקטעת, היא ממשיכה מאותה נקודה.'
  },
  {
    q: 'יש לי כמה מחשבים בלי אינטרנט. צריך להוריד לכל אחד?',
    a: 'לא. כונן אחד מספיק לכמה מחשבים. חבר אותו לכל מחשב בתורו, ועדכן.'
  },
  {
    q: 'למה צריך לסגור את אוצריא?',
    a: 'אי אפשר לעדכן את אוצריא בזמן שהיא פתוחה. אם שכחת לסגור אותה, הכלי יזהה את זה ויתריע לפני העדכון.'
  },
  {
    q: 'ב-macOS הכלי לא נפתח. מה לעשות?',
    a: 'בפתיחה הראשונה macOS עשוי לחסום את הכלי. פתח את הגדרות המערכת ← פרטיות ואבטחה, ואשר את הפתיחה. מעתה הכלי ייפתח כרגיל.'
  },
  {
    q: 'אפשר להשתמש בו גם במחשב מחובר?',
    a: 'כן. במחשב עם אינטרנט הכלי מעדכן את אוצריא כרגיל. הוא גם מעדכן את עצמו, והעדכון שלו עובר על הכונן כמו כל השאר.'
  }
]

// שאלות ותשובות קצרות — רשימה בכרטיס אחד (שאלה = h3, ניווט לפי כותרות), עם קו מפריד בין פריט לפריט.
// כל התשובות גלויות (בלי אקורדיון): הן קצרות, ומי שמגיע לכאן בא לקרוא אותן.
export default function GoodToKnowSection({ repoUrl }) {
  return (
    <Section labelledBy="faq-heading" container="narrow">
      <SectionHeading id="faq-heading" title="טוב לדעת" />
      <Card padding="none">
        <ul className="divide-y divide-outline-variant">
          {ITEMS.map((item) => (
            <li key={item.q} className="p-4 sm:p-5 xl:p-6">
              <h3 className="text-title-sm text-on-surface sm:text-title-md">{item.q}</h3>
              <p className="mt-1 text-body-sm text-on-surface-variant sm:text-body-md">{item.a}</p>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button href={`${repoUrl}/issues`} external variant="outlined" icon="bug_report">
          דיווח על תקלה בכלי<NewWindowHint destination="ב-GitHub" />
        </Button>
        <Button href={repoUrl} external variant="outlined" icon="code">
          קוד המקור ב-GitHub<NewWindowHint />
        </Button>
      </div>
    </Section>
  )
}
