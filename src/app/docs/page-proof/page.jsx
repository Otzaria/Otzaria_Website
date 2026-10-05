import Link from 'next/link'
import OtzariaSoftwareHeader from '@/components/layout/OtzariaSoftwareHeader'
import OtzariaSoftwareFooter from '@/components/layout/OtzariaSoftwareFooter'
import { CLAIM_HOURS, MAX_HELD } from '@/lib/pageProof/gridState'
import { SUBMITTED_WAITING } from '@/lib/pageProof/helpTexts'
import { STAGE_TEXT } from '@/lib/pageProof/stages'
import { FurnitureFigure, SectionNumberFigure, SplitLineFigure, TwoColumnsFigure, UnlinkFigure } from '@/components/pageProof/guide/GuideFigures'

// הנחיות להגהת עמודים — דף אחד קצר למתנדבים, עם תמונות (שרטוטים סינתטיים — GuideFigures). ציבורי (בלי התחברות),
// כדי שאפשר יהיה לקשר אליו מהפורום; העורך מקשר אליו מהסרגל ("הנחיות") ומחלון העזרה (helpTexts.GUIDE_PATH).
// הכללים כאן הם "הקו האחיד" שבעל הפרויקט קבע (2026-10-05), במקום תשובות פזורות באשכול. שמות הכפתורים של שני השלבים
// (מבנה ואחר-כך טקסט) נלקחים מ-lib/pageProof/stages.js (STAGE_TEXT) — אותו נוסח כמו בעורך (StageBar, StagedEditor).

export const metadata = {
  title: 'הנחיות להגהת עמודים - אוצריא',
  description: 'דף אחד קצר למתנדבי הגהת העמודים: מסגרות, ריהוט, חיתוך שורות, טקסט, פגם בדפוס, סגנונות, פסקאות, קישורים וזמנים.',
}

const TOC = [
  { href: '#structure', label: 'שלב 1: המבנה' },
  { href: '#text', label: 'שלב 2: הטקסט' },
  { href: '#links', label: 'קישורים' },
  { href: '#time', label: 'זמנים' },
  { href: '#questions', label: 'שאלות' },
]

function Kbd({ children }) {
  return (
    <kbd dir="ltr" className="whitespace-nowrap rounded border border-surface-variant bg-surface px-1.5 py-0.5 font-sans text-sm font-bold">
      {children}
    </kbd>
  )
}

function Section({ id, icon, title, children }) {
  return (
    <section id={id} className="glass-strong scroll-mt-24 rounded-xl p-6 md:p-8">
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold text-primary-dark">
        <span aria-hidden="true" className="material-symbols-outlined text-3xl">{icon}</span>
        {title}
      </h2>
      <div className="space-y-4 text-lg leading-relaxed text-on-surface/85">{children}</div>
    </section>
  )
}

export default function PageProofGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <OtzariaSoftwareHeader />

      <main className="px-4 py-12">
        <div className="container mx-auto max-w-4xl space-y-8">
          <div className="flex items-center gap-2 text-sm text-on-surface/60">
            <Link href="/" prefetch={false} className="hover:text-primary">
              בית
            </Link>
            <span>›</span>
            <Link href="/docs" className="hover:text-primary">
              מדריכים
            </Link>
            <span>›</span>
            <span className="text-on-surface">הנחיות להגהת עמודים</span>
          </div>

          <div className="glass-strong rounded-2xl border-4 border-primary p-10 text-center">
            <span aria-hidden="true" className="material-symbols-outlined mb-4 block text-7xl text-primary">
              fact_check
            </span>
            <h1 className="mb-4 font-frank text-4xl font-bold text-primary-dark">הנחיות להגהת עמודים</h1>
            <p className="mx-auto max-w-2xl text-xl text-on-surface/75">
              כל עמוד עובר שני שלבים: <b>קודם המבנה</b> (מסגרות ושורות), <b>ואחר כך הטקסט</b>. כל מה שתעשו נשמר לבד, גם בשרת — אפשר
              להמשיך ממחשב אחר.
            </p>
            <nav aria-label="תוכן הדף" className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
              {TOC.map((t) => (
                <a key={t.href} href={t.href} className="rounded-full bg-surface-variant/60 px-3 py-1 hover:bg-surface-variant">
                  {t.label}
                </a>
              ))}
            </nav>
          </div>

          <Section id="structure" icon="space_dashboard" title="שלב 1: המבנה">
            <ol className="list-decimal space-y-4 pr-6">
              <li>
                <b>מסגרת לכל אזור טקסט.</b> שני טורים = שתי מסגרות. הערות מתחת לקו = מסגרת משלהן.
                <div className="mt-3">
                  <TwoColumnsFigure />
                </div>
              </li>
              <li>
                <b>ריהוט הדף</b> — כותרת-רצה, מספר עמוד, שם הספר בראש העמוד, מילת-ההמשך בתחתית, קו מפריד: מה שהמחשב כבר זיהה מסומן{' '}
                <b>באפור</b> — לא צריך לצייר לו מסגרת. מה שלא זוהה — מסגרת &quot;ריהוט הדף&quot;. את הטקסט של הריהוט לא צריך להגיה — הוא לא
                נכנס לספר.
                <div className="mt-3">
                  <FurnitureFigure />
                </div>
              </li>
              <li>
                <b>כותרת פרק או סעיף</b> (גם בתוך ההערות) — לא מסגרת נפרדת. היא חלק מהטקסט, בתוך המסגרת של הזרם שלה, ומסמנים אותה בשלב
                הטקסט בסגנון-הפסקה <b>&quot;כותרת&quot;</b> (בתפריט &quot;סגנון פסקה&quot;).
              </li>
              <li>
                <b>שורה שחתוכה לא נכון</b> (חצי שורה, שתי שורות בתיבה אחת, שורה שלא סומנה) — במצב &quot;שורות&quot;: פיצול, איחוד או שורה
                חדשה.
                <p className="mt-2">
                  כשמסיימים — <b>&quot;{STAGE_TEXT.finish}&quot;</b> (ואם אין מה לתקן: <b>&quot;{STAGE_TEXT.skip}&quot;</b>, בפס שמעל העורך) ועוברים
                  מיד לשלב הטקסט. אם תיקנתם את חיתוך השורות, הכפתור הוא <b>&quot;{STAGE_TEXT.finishRecut}&quot;</b>: העמוד נשלח
                  לזיהוי-מחדש וחוזר אליכם לשלב הטקסט כשיזוהה (תראו אותו ב&quot;העמודים שלי&quot;). אם אי אפשר לשלוח אותו עכשיו — עוברים
                  לשלב הטקסט, והשורות שנחתכו נעולות עד ההגשה.
                </p>
                <p className="mt-2 rounded-lg bg-warning-alt-50 px-3 py-2 text-base">
                  חיתוך תקין אבל הטקסט שגוי — <b>לא</b> מתקנים את החיתוך: מתקנים את הטקסט בשלב 2.
                </p>
                <div className="mt-3">
                  <SplitLineFigure />
                </div>
              </li>
            </ol>
            <p className="text-base text-on-surface/70">
              רוצים לראות את הסריקה נקייה, בלי המסגרות והתיבות? בסריקה — <b>&quot;בלי סימונים&quot;</b> (ולחיצה נוספת מחזירה אותם). הזום — בכפתורי
              הזום או ב-<Kbd>Ctrl</Kbd>+גלגלת.
            </p>
          </Section>

          <Section id="text" icon="edit_note" title="שלב 2: הטקסט">
            <ol className="list-decimal space-y-4 pr-6">
              <li>
                <b>מקלידים מה שכתוב בדף.</b> אות שבורה שעוד רואים מה היא — מקלידים את האות הנכונה.
              </li>
              <li>
                <b>פגם בדפוס</b> (אות אחרת מהנכונה, נקודה במקום אות, אות חסרה) — מתקנים למה שאמור להיות כתוב, ומדליקים בסרגל{' '}
                <b>&quot;פגם בדפוס&quot;</b>: כשהמצב דולק, כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב.
              </li>
              <li>
                <b>נקודה מיוחדת</b> (מעוינת, מוגבהת) = נקודה רגילה.
              </li>
              <li>
                <b>מספר סעיף</b> — מודגש (B), <b>בלי</b> גרשיים, כמו במקור. כשבאותה שורה יש גם דיבור-המתחיל: המספר מודגש, והפסקה —
                &quot;דיבור המתחיל&quot;.
                <div className="mt-3">
                  <SectionNumberFigure />
                </div>
              </li>
              <li>
                <b>מילה מודגשת או גדולה</b> בתוך המשפט — סגנון-תו (B או A+), לא מסגרת ולא שורה נפרדת.
              </li>
              <li>
                <b>פסקאות:</b> <Kbd>Enter</Kbd> = פסקה חדשה; <Kbd>Backspace</Kbd> בתחילת פסקה = חיבור לקודמת.
              </li>
              <li>
                <b>אישור:</b> ✓ ליד הפסקה (או <Kbd>Ctrl+Enter</Kbd>) = &quot;בדקתי, הטקסט נכון&quot;.
              </li>
              <li>
                <b>בסוף:</b> <b>&quot;הגשת העמוד&quot;</b> — משלב הטקסט. צריך לתקן עוד מסגרת או שורה? <b>&quot;{STAGE_TEXT.back}&quot;</b> — הטקסט
                שתיקנתם נשאר.
              </li>
              <li>
                <b>עמוד שמתנדב אחר כבר עבד עליו</b> (או עמוד שנפתח מחדש אחרי אישור) — מגיע עם התיקונים שלו, מסומנים בקו מנוקד (בריחוף —
                הטקסט המקורי). תיקון שגוי — בלוח הפרטים ← &quot;שינויים&quot; ← <b>&quot;החזר למקור&quot;</b>.
              </li>
            </ol>
          </Section>

          <Section id="links" icon="link" title="קישורים">
            <ul className="list-disc space-y-3 pr-6">
              <li>
                <b>יוצרים:</b> מסמנים מילה (ציון ההערה) ← &quot;קישור&quot; (<Kbd>Ctrl+K</Kbd>) ← עוברים לזרם השני ומסמנים את המילה
                המקבילה ← שוב &quot;קישור&quot;.
              </li>
              <li>
                <b>קישור שגוי</b> — גם כזה שהמחשב יצר, וגם כזה שמתנדב יצר: לוחצים על המספר הקטן שאחרי המילה (①) ←{' '}
                <b>&quot;בטל קישור&quot;</b>. אותו כפתור יש גם בלוח הפרטים ← &quot;קישורים&quot;. התחרטתם — שם, ב&quot;קישורים שבוטלו&quot;:{' '}
                <b>&quot;החזר לאוטומטי&quot;</b>.
              </li>
            </ul>
            <UnlinkFigure />
          </Section>

          <Section id="time" icon="schedule" title="זמנים">
            <ul className="list-disc space-y-3 pr-6">
              <li>
                עמוד שתפסתם שמור לכם <b>{CLAIM_HOURS} שעות</b> (שבת וחג אינם נספרים), וכל פתיחה מחדשת את הזמן. אפשר להחזיק עד {MAX_HELD} עמודים
                בבת אחת; עד מתי כל עמוד שמור — ב&quot;העמודים שלי&quot;.
              </li>
              <li>
                עמוד שהגשתם מופיע ב&quot;העמודים שלי&quot; כ<b>&quot;{SUBMITTED_WAITING}&quot;</b>: אין צורך לעשות דבר, והוא כבר לא תופס מקום
                מהעמודים שאתם מחזיקים.
              </li>
              <li>עמוד שנשלח לזיהוי-מחדש חוזר אליכם כשהמחשב של המנהל מעבד אותו.</li>
            </ul>
          </Section>

          <Section id="questions" icon="forum" title="שאלות">
            <p>באשכול בפורום — עם צילום של העמוד.</p>
            <p className="text-base">
              {/* דף ההגהה דורש התחברות — בלי prefetch מדף ציבורי (scripts/check-prefetch.mjs) */}
              <Link href="/library/page-proof" prefetch={false} className="font-bold text-primary hover:underline">
                לדף הגהת העמודים
              </Link>
            </p>
          </Section>
        </div>
      </main>

      <OtzariaSoftwareFooter />
    </div>
  )
}
