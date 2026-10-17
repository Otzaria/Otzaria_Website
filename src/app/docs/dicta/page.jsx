import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import DocsArticle from '@/components/docs/DocsArticle'
import DocsBeforeAfter from '@/components/docs/DocsBeforeAfter'
import DocsBreadcrumbs from '@/components/docs/DocsBreadcrumbs'
import DocsCallout from '@/components/docs/DocsCallout'
import DocsCodeBlock from '@/components/docs/DocsCodeBlock'
import DocsHeadingLevels from '@/components/docs/DocsHeadingLevels'
import DocsHelpCard from '@/components/docs/DocsHelpCard'
import DocsHero from '@/components/docs/DocsHero'
import DocsLayout from '@/components/docs/DocsLayout'
import DocsSection from '@/components/docs/DocsSection'
import { PROSE } from '@/components/docs/proseClasses'
import Button from '@/components/ui/Button'

const tocItems = [
  { href: '#intro', label: 'הקדמה' },
  { href: '#structure', label: 'מבנה הכותרות' },
  { href: '#markup', label: 'סימני התוכנה' },
  { href: '#tools', label: 'התוכנות והאפשרויות' },
  { href: '#demo', label: 'הדגמה מעשית' },
  { href: '#notes', label: 'הערות חשובות' }
]

const MARKUP_LEVELS = [
  { title: 'כותרת רמה 1', code: '<h1>שם הספר</h1>' },
  { title: 'כותרת רמה 2', code: '<h2>פרק ראשון</h2>' },
  { title: 'כותרת רמה 3', code: '<h3>סימן א</h3>' }
]

const TOOL_BOX = 'rounded-card bg-surface-container-low p-4 sm:p-5'
const TOOL_TITLE = 'mb-3 text-title-lg text-on-surface'

// עיצוב כיוון א': אותה מעטפת כמו דפי הוויקי (DocsLayout) — כותרת, תוכן עניינים דביק בצד
// (מקפל בנייד) ועמודת קריאה אחת. הנוסח — ללא שינוי.
export default function DictaTutorialPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-on-surface">
      <OtzariaSoftwareHeader />

      <main id="main-content" className="flex-1">
        <DocsLayout
          titleId="dicta-title"
          breadcrumbs={
            <DocsBreadcrumbs
              items={[
                { label: 'בית', href: '/', prefetch: false },
                { label: 'מדריכים', href: '/docs' },
                { label: 'מדריך לטיפול בספרי דיקטה' }
              ]}
            />
          }
          hero={
            <DocsHero
              id="dicta-title"
              icon="school"
              title="מדריך לטיפול בספרי דיקטה"
              subtitle="הדרכה מפורטת ליצירת כותרות וניווט בספרים"
            />
          }
          toc={{ title: 'תוכן עניינים', items: tocItems }}
          after={
            <>
              <DocsCallout tone="success" icon="celebration" className="mt-8">
                <p><strong>כל הכבוד!</strong> עכשיו אתם יודעים כיצד לעבד ספרי דיקטה ולהפוך אותם לספרים עם ניווט מלא באוצריא!</p>
              </DocsCallout>

              <DocsHelpCard
                id="dicta-help"
                title="זקוק לעזרה?"
                action={
                  <Button href="/faq" icon="arrow_back">
                    לשאלות נפוצות
                  </Button>
                }
              >
                אם יש לך שאלות על עיבוד ספרי דיקטה, פנה לקהילה או לצוות הפיתוח.
              </DocsHelpCard>
            </>
          }
        >
          <DocsArticle>
            <DocsSection id="intro" icon="info" title="הקדמה">
              <p>ישנם מאות ספרים שהגיעו ממאגר חינמי, אך אינם מתאימים לאוצריא מכיוון שאין בהם אפשרות לניווט (כלומר, הם לא מחולקים לפרקים/תשובות וכדומה).</p>
              <p><strong className={PROSE.strong}>המטרה:</strong> לקחת את קובץ הטקסט שקיבלנו, ולחלק אותו לכותרות.</p>
              <p>העבודה בבסיסה ידנית, ולבקשת העורכים נוצרו תוכנות שמייעלות את העבודה, ועושות חלק ממנה בצורה אוטומטית.</p>
              <DocsCallout tone="tip" icon="lightbulb">
                <p><strong>טיפ חשוב:</strong> צרו גיבוי לעבודה מדי פעם, כך שגם אם הרצתם איזו תוכנה שעשתה פעולה לא נכונה, תוכלו לחזור אחורה.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="structure" icon="account_tree" title="הסבר מבנה הכותרות">
              <p>כל ספר מורכב מכותרות היררכיות. למשל, שם הספר הוא כותרת ברמה הגבוהה ביותר - <strong className={PROSE.strong}>רמה 1</strong>. לאחריו מגיעה <strong className={PROSE.strong}>רמה 2</strong> שהיא החלוקה הראשונית, <strong className={PROSE.strong}>רמה 3</strong> היא חלוקה פנימית וכן הלאה.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <DocsHeadingLevels
                  title="דוגמה 1: מסכת"
                  rows={[
                    { level: 1, label: 'מסכת ברכות' },
                    { level: 2, label: 'פרק ראשון' },
                    { level: 3, label: 'דף ב עמוד א' }
                  ]}
                />
                <DocsHeadingLevels
                  title={'דוגמה 2: ספר שו"ת'}
                  rows={[
                    { level: 1, label: 'שו"ת הרשב"א' },
                    { level: 2, label: 'חלק א' },
                    { level: 3, label: 'סימן א' }
                  ]}
                />
              </div>
            </DocsSection>

            <DocsSection id="markup" icon="code" title="סימני התוכנה">
              <p>כדי לסמן כותרות בקובץ הטקסט, משתמשים בתגיות HTML:</p>
              <div className="space-y-4">
                {MARKUP_LEVELS.map((item) => (
                  <div key={item.title}>
                    <h3 className="mb-2 text-title-lg text-on-surface">{item.title}</h3>
                    <DocsCodeBlock>{item.code}</DocsCodeBlock>
                  </div>
                ))}
              </div>
              <DocsCallout tone="info" icon="info">
                <p><strong>הערה:</strong> ניתן להשתמש עד רמה 6 (h1 עד h6), אך ברוב המקרים מספיקות 3-4 רמות.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="tools" icon="build" title="התוכנות והאפשרויות">
              <p>ישנן מספר דרכים לעבוד על הקבצים:</p>
              <div className="space-y-4">
                <div className={TOOL_BOX}>
                  <h3 className={TOOL_TITLE}>1. עריכה ידנית</h3>
                  <p className="mb-3">השתמשו בעורך טקסט כמו Notepad++ או VS Code:</p>
                  <ul className={PROSE.ul}>
                    <li>פתחו את קובץ הטקסט</li>
                    <li>חפשו את הכותרות</li>
                    <li>הוסיפו תגיות HTML מתאימות</li>
                    <li>שמרו את הקובץ</li>
                  </ul>
                </div>

                <div className={TOOL_BOX}>
                  <h3 className={TOOL_TITLE}>2. שימוש בחיפוש והחלפה</h3>
                  <p className="mb-3">אם יש דפוס קבוע בכותרות, תוכלו להשתמש בחיפוש והחלפה:</p>
                  <ul className={PROSE.ul}>
                    <li>חפשו דפוס חוזר (למשל &quot;פרק&quot;)</li>
                    <li>החליפו אותו ב-&quot;<bdi dir="ltr">{'<'}h2{'>'}</bdi>פרק&quot; ובסוף השורה הוסיפו &quot;<bdi dir="ltr">{'<'}/h2{'>'}</bdi>&quot;</li>
                    <li>בדקו שהתוצאה נכונה</li>
                  </ul>
                </div>

                <div className={TOOL_BOX}>
                  <h3 className={TOOL_TITLE}>3. כלים אוטומטיים</h3>
                  <p className="mb-3">ניתן להשתמש בכלי AI או סקריפטים:</p>
                  <ul className={PROSE.ul}>
                    <li>ChatGPT או Claude - תנו להם חלק מהטקסט ובקשו לזהות כותרות</li>
                    <li>סקריפטים מותאמים אישית</li>
                    <li>תוכנות המרה מיוחדות</li>
                  </ul>
                </div>
              </div>
            </DocsSection>

            <DocsSection id="demo" icon="play_circle" title="הדגמה מעשית">
              <p>דוגמה לעבודה על קטע מספר שו&quot;ת:</p>
              <DocsBeforeAfter
                before={{
                  title: 'לפני העריכה:',
                  lines: [
                    'שו"ת הרשב"א',
                    'חלק ראשון',
                    'סימן א',
                    'שאלה: מה דין כהן שנטמא...',
                    'תשובה: הנה התשובה...',
                    'סימן ב',
                    'שאלה: מה דין לוי שעבר...',
                    'תשובה: כך נראה לי...'
                  ]
                }}
                after={{
                  title: 'אחרי העריכה:',
                  lines: [
                    '<h1>שו"ת הרשב"א</h1>',
                    '<h2>חלק ראשון</h2>',
                    '<h3>סימן א</h3>',
                    'שאלה: מה דין כהן שנטמא...',
                    'תשובה: הנה התשובה...',
                    '<h3>סימן ב</h3>',
                    'שאלה: מה דין לוי שעבר...',
                    'תשובה: כך נראה לי...'
                  ]
                }}
              />
              <DocsCallout tone="tip" icon="tips_and_updates">
                <p><strong>טיפ:</strong> התחילו עם קטע קטן כדי לבדוק שהתוצאה נכונה, ורק אז המשיכו לכל הספר.</p>
              </DocsCallout>
            </DocsSection>

            <DocsSection id="notes" icon="note" title="הערות חשובות">
              <DocsCallout tone="caution" icon="warning" title="זהירות:">
                <ul className={PROSE.ul}>
                  <li>וודאו שהתגיות נסגרות נכון (<bdi dir="ltr">{'<'}h1{'>'}...{'<'}/h1{'>'}</bdi>)</li>
                  <li>אל תשכחו את הסלש בתגית הסגירה</li>
                  <li>השתמשו ברמות נכונות (h1 לכותרת הראשית, h2 לחלוקה הבאה וכו&apos;)</li>
                </ul>
              </DocsCallout>
              <DocsCallout tone="info" icon="info" title="טיפים נוספים:">
                <ul className={PROSE.ul}>
                  <li>שמרו גיבוי לפני שמתחילים</li>
                  <li>עבדו בחלקים קטנים ובדקו התוצאה</li>
                  <li>השתמשו בעורך טקסט עם הדגשת תחביר (Syntax Highlighting)</li>
                  <li>בדקו את התוצאה באוצריא לפני שמסיימים</li>
                </ul>
              </DocsCallout>
              <DocsCallout tone="success" icon="check_circle" title="בדיקת איכות:">
                <ul className={PROSE.ul}>
                  <li>פתחו את הספר באוצריא ובדקו שהניווט עובד</li>
                  <li>וודאו שכל הכותרות מופיעות בעץ הניווט</li>
                  <li>בדקו שאין כותרות ריקות או שגויות</li>
                  <li>וודאו שהתוכן לא נפגע בתהליך</li>
                </ul>
              </DocsCallout>
            </DocsSection>
          </DocsArticle>
        </DocsLayout>
      </main>

      <OtzariaSoftwareFooter className="mt-20" />
    </div>
  )
}
