'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PARA_STYLE_OPTIONS } from './ProofToolbar'
import { CLAIM_RULE } from '@/lib/pageProof/gridState'
import { BOOK_ONLY_TEXT_STEP, FAQ, GUIDE_PATH, GUIDE_TITLE } from '@/lib/pageProof/helpTexts'

// "מה עושים בעמוד" — ההסבר הקצר של עורך הגהת-העמודים (במקום ProofRules):
// שלושה צעדים, "איך עושים" מתקפל עם המקשים, ומה עושים בסיום.
//
// open/onClose — פתיחה יזומה (כפתור "?" בסרגל). בנוסף החלון נפתח לבד בפעם
// הראשונה (כל עוד אין 'pageProof.helpSeen' ב-localStorage); סגירה מסמנת
// שנראה. autoOpen=false — בלי פתיחה לבד (למשל בסקירת מנהל). אם כמה מופעים
// מורכבים יחד (הדף והעורך) — רק אחד מהם נפתח לבד.
// texts (רשות) — נוסח אחר לחלקים שתלויים באתר, בשביל עורך שמוטמע במקום אחר (תוכנת-הספר:
// אין שם הגשה, מנהל או תפיסת-עמוד). כל שדה רשות, ובלעדיו — הנוסח של האתר:
//   intro — משפט-הפתיחה · extra — ReactNode מיד אחריו · faq — [{key, q, a}] במקום FAQ
//   · done — [ReactNode] במקום "סיימתי — מה עכשיו?" (מערך ריק — בלי הסעיף; כך גם faq)
//   · guide — דף ההנחיות (GUIDE_PATH): {href?, open?(href)} — open פותח אותו בעצמו (עורך מוטמע: בדפדפן החיצוני);
//     null/false — בלי הקישור. בלי השדה — הקישור של האתר, בלשונית חדשה (גם בסרגל — ProofEditor)

// דף ההנחיות: {href, open} או null (ראו texts.guide למעלה)
export function guideOf(texts) {
  const g = texts?.guide
  if (g === null || g === false) return null
  return { href: (g && typeof g.href === 'string' && g.href) || GUIDE_PATH, open: g && typeof g.open === 'function' ? g.open : null }
}

// פתיחת דף ההנחיות: open של הדף העוטף, ואחרת לשונית חדשה
export function openGuide(guide) {
  if (!guide) return
  if (guide.open) guide.open(guide.href)
  else if (typeof window !== 'undefined') window.open(guide.href, '_blank', 'noopener,noreferrer')
}

export const HELP_SEEN_KEY = 'pageProof.helpSeen'

export const HELP_INTRO = 'המחשב כבר קרא את העמוד. אתם בודקים מול הסריקה ומתקנים — כל שינוי נבדק בידי מנהל לפני שהוא נכנס לספר.'

// המופע שנפתח לבד בטעינה הזו
let autoOwner = null

function helpSeen() {
  try {
    return window.localStorage.getItem(HELP_SEEN_KEY) != null
  } catch {
    // אחסון חסום: אי-אפשר לזכור שנראה — עדיף לא לפתוח לבד בכל עמוד מחדש
    return true
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
  } catch {
    /* אחסון חסום — פשוט לא נזכר */
  }
}

function Kbd({ children }) {
  return (
    <kbd dir="ltr" className="whitespace-nowrap rounded border border-surface-variant bg-surface px-1.5 py-0.5 font-sans text-xs font-bold text-on-surface">
      {children}
    </kbd>
  )
}

const STEPS = [
  {
    title: 'מסגרות',
    body: (
      <>
        בדקו בסריקה שכל אזור טקסט מוקף במסגרת בצבע הנכון ובמספר הנכון (למשל &quot;ראשי 1&quot;, &quot;ראשי 2&quot;). מסגרת חסרה או
        שגויה — ציירו או תקנו אותה; הכול נכון — &quot;✓ המסגרות נכונות&quot;.
      </>
    ),
  },
  {
    title: 'טקסט',
    body: (
      <>
        קראו מול הסריקה ותקנו ישר בטקסט, כמו בכל עורך. הסריקה זזה עם הסמן: השורה שאתם עובדים בה עומדת מול אותה שורה בסריקה, והמילה
        שבסמן מסומנת שם. מילים מסומנות בטקסט = המחשב חושד בהן (ראו &quot;מה אומרים הסימונים&quot; למטה). פסקה שקראתם ונכונה — אשרו
        אותה ב-✓ שליד הפסקה או ב-<Kbd>Ctrl+Enter</Kbd>. אות שבורה, פגומה או מחוברת לשכנתה — הקלידו את האותיות שנועדו להיות שם (ראו
        &quot;שאלות שחוזרות&quot; למטה). {BOOK_ONLY_TEXT_STEP}
      </>
    ),
  },
  {
    title: 'עיצוב ופסקאות',
    body: (
      <>
        סמנו כותרות, הדגשות ומילים באנגלית (הכפתור &quot;EN&quot; — לועזית) בסרגל שלמעלה, וחלקו לפסקאות כמו במקור: <Kbd>Enter</Kbd>{' '}
        מתחיל פסקה חדשה, <Kbd>Backspace</Kbd> בתחילת פסקה מחבר אותה לקודמת — או הכפתור ↑ שמופיע בין הפסקה שבה הסמן לקודמת לה
        (&quot;חיבור לפסקה הקודמת&quot;, גם בסוף התפריט &quot;סגנון פסקה&quot;). סוג הפסקה — בתפריט &quot;סגנון פסקה&quot;: כותרת, ציטוט,
        דיבור המתחיל, וגם סעיף ממוספר, הגהה, שורות קצרות (שירה) ושורת תוכן עניינים (הרשימה המלאה — ב&quot;איך עושים&quot; למטה).
      </>
    ),
  },
]

// הטקסט מוצג כמו בספר — וזו רק תצוגה
const DISPLAY_NOTE =
  'הטקסט מוצג מיושר לשני הצדדים, כמו בספר — זו רק תצוגה: הטקסט עצמו והשורות לא משתנים. כך גם הגופן וגודל האותיות שבסרגל.'

const or = <span className="mx-1 text-on-surface/50">או</span>
const slash = <span className="mx-1 text-on-surface/50">/</span>

// מה אומרים הסימונים על המילים (אותם סגנונות כמו בטקסט — FlowEditor)
const MARKS = [
  {
    sample: <span className="underline decoration-dashed decoration-danger-500 decoration-2 underline-offset-[5px]">מילה</span>,
    what: 'קו אדום מקווקו — המחשב לא בטוח במילה, ואין לו הצעות: בדקו אותה מול הסריקה ותקנו אם צריך.',
  },
  {
    sample: <span className="underline decoration-dotted decoration-info-600 decoration-2 underline-offset-[5px]">מילה</span>,
    what: 'קו כחול מנוקד — יש למחשב הצעות אחרות למילה.',
  },
  {
    sample: <span className="rounded-sm bg-feature-100 px-0.5">מילה</span>,
    what: 'רקע סגול — מודל-השפה מציע מילה דומה בכתיב שמתאימה יותר להקשר.',
  },
  {
    sample: <span className="rounded-sm bg-warning-strong-100 px-0.5">מילה</span>,
    what: 'רקע כתום — אחת מהחלופות של הזיהוי מתאימה יותר להקשר.',
  },
  {
    sample: <span className="font-bold text-on-surface/60">מילה</span>,
    what: 'מודגש אפור — מילות דיבור-המתחיל, מודגשות אוטומטית: אין צורך לסמן אותן B.',
  },
]

const KEYS = [
  { what: 'לזוז בטקסט', how: <>החיצים, כמו בכל עורך — והסריקה זזה איתכם</> },
  { what: 'מילה חשודה הבאה / הקודמת', how: <><Kbd>F8</Kbd>{slash}<Kbd>Shift+F8</Kbd></> },
  { what: 'הצעות למילה שבסמן', how: <><Kbd>Alt+↓</Kbd>{or}<Kbd>Ctrl+Space</Kbd></> },
  { what: 'אישור הפסקה ומעבר לבאה', how: <><Kbd>Ctrl+Enter</Kbd>{or}✓ שליד הפסקה</> },
  { what: 'פסקה חדשה מהסמן', how: <Kbd>Enter</Kbd> },
  { what: 'חיבור לפסקה הקודמת', how: <><Kbd>Backspace</Kbd> בתחילת הפסקה{or}הכפתור ↑ שבין הפסקאות{or}&quot;סגנון פסקה&quot; ← &quot;חיבור לפסקה הקודמת&quot;</> },
  { what: 'מודגש / נטוי', how: <><Kbd>Ctrl+B</Kbd>{slash}<Kbd>Ctrl+I</Kbd></> },
  {
    what: 'קישור בין שני זרמים',
    how: (
      <>
        בוחרים מילה, <Kbd>Ctrl+K</Kbd>, עוברים ללשונית של הזרם השני, בוחרים את המילה המקבילה ושוב <Kbd>Ctrl+K</Kbd>. לכל שורת-הערה (או
        פירוש) קישור אחד — קישור חדש מאותה שורה מחליף את הקודם, אחרי אישור. הצד השני בעמוד אחר (פירוש שגולש לעמוד הקודם או הבא)?
        אחרי <Kbd>Ctrl+K</Kbd> הראשון בוחרים את העמוד בפס הכחול שמעל הטקסט, ולוחצים שם על המילה.
      </>
    ),
  },
  { what: 'ביטול / חזרה', how: <><Kbd>Ctrl+Z</Kbd>{slash}<Kbd>Ctrl+Y</Kbd> (או <Kbd>Ctrl+Shift+Z</Kbd>)</> },
  { what: 'סגירת חלונית או ביטול קישור', how: <Kbd>Esc</Kbd> },
]

const SCAN = [
  <>
    <b>הסריקה עוקבת אחרי הסמן:</b> כשזזים בטקסט (חיצים, הקלדה או לחיצה בטקסט) הסריקה נגללת כך שהשורה שאתם עובדים בה עומדת מול
    השורה שלה בסריקה, והמילה שבסמן מסומנת עליה. לחיצה על הסריקה מעבירה את הסמן לשורה ולמילה שם — בלי להזיז את הסריקה מתחת לעכבר.
    כשהמסך צר והלוחות זה מעל זה — הסריקה רק דואגת שהשורה תיראה.
  </>,
  <>
    <b>מצב &quot;מסגרות&quot;:</b> &quot;מסגרת חדשה&quot; וגרירה על הסריקה. לחיצה על מסגרת — בחירת הזרם שלה והמספר שלה בזרם, הזזה, שינוי
    גודל או מחיקה. כל שינוי במסגרות — גם אישור ומחיקה — מתבטל ב-<Kbd>Ctrl+Z</Kbd> (או בכפתור הביטול שבסרגל).
  </>,
  <>
    <b>שורה שבולטת מהמסגרת</b> (קו אדום מקווקו) — אינה נספרת כשייכת למסגרת. שורה שנחתכה על פני שני טורים: פצלו אותה במצב
    &quot;שורות&quot;. שורה שכולה של המסגרת ורק בולטת ממנה מעט: לחצו עליה ו«השורה שייכת למסגרת הזו» (הזרם שלה ייקבע לפי המסגרת), או
    הגדילו את המסגרת.
  </>,
  <>
    <b>מצב &quot;שורות&quot;:</b> פיצול (לחיצה בתוך השורה במקום שצריך לחתוך), איחוד (שתי שורות מסומנות), שורה חדשה (גרירה סביב שורה
    שחסרה), &quot;לא-שורה&quot; לתיבה שאינה טקסט (כתם, קישוט, רעש). בסוף — &quot;✓ החיתוך בעמוד תקין&quot;.
  </>,
  <>
    <b>ריהוט הדף</b> — כותרת-רצה, מספר עמוד וקו מפריד: חלק מהדף אבל לא מהספר. שורה כזו שנקראה כטקסט של הספר — שייכו אותה לריהוט:
    במסגרת סביבה (בבחירת הזרם של המסגרת: &quot;ריהוט הדף&quot;), או בתפריט &quot;זרם&quot; שבסרגל (בסוף התפריט: &quot;ריהוט הדף · כותרת
    עמוד / תחתית / מפריד&quot;). היא עוברת ללשונית &quot;ריהוט הדף&quot;. כותרת שפותחת פרק או סעיף בתוך הטקסט אינה ריהוט ואינה מסגרת —
    מסמנים אותה בסגנון-הפסקה &quot;כותרת&quot; (ראו &quot;שאלות שחוזרות&quot;).
  </>,
  <>
    <b>קו מפריד</b> (הקו שבין הטקסט להערות, גם כשהוא מעוטר) שנקרא כאילו היה טקסט — הוא חלק מהדף אבל לא מהספר: שייכו את השורה לזרם
    &quot;מפריד&quot; (ריהוט) — במסגרת, או בתפריט &quot;זרם&quot; שבסרגל. קישוט, כתם או רעש — &quot;לא-שורה&quot;: במצב &quot;שורות&quot;, או
    בכפתור &quot;לא-שורה&quot; שמופיע בטקסט ליד שורה ריקה.
  </>,
]

const DONE = [
  <>
    לחצו &quot;הגשת העמוד&quot;. אישרתם את כל הפסקאות — &quot;הגש&quot;. לא את כולן — &quot;אשר גם את כל השאר והגש&quot; (רק אם באמת קראתם את
    כל הטקסט בעמוד), או &quot;הגש רק את מה שאישרתי&quot;.
  </>,
  <>מנהל בודק כל הגשה לפני שהיא נכנסת לספר. עד ההגשה העבודה נשמרת בדפדפן, ו-<Kbd>Ctrl+Z</Kbd> מבטל כל פעולה.</>,
  <>
    <b>כמה זמן העמוד שלכם:</b> {CLAIM_RULE} עמודים חדשים תופסים רק ב&quot;בחירת עמודים&quot; (רשת-העמודים של הספר) — הכניסה לדף לא
    תופסת שום עמוד.
  </>,
  <>
    תיקנתם חיתוך? בסוף שלב המבנה העמוד נשלח לזיהוי-מחדש — בלי מנהל, או לאישור מנהל כשאי אפשר אחרת — ונעול עד שיחזור אליכם עם
    השורות החדשות (מסומנות בצהוב); שאר התיקונים שלכם מחכים לכם בו. בינתיים אפשר לתפוס עמודים אחרים.
  </>,
]

export default function ProofHelp({ open = false, onClose, autoOpen = true, texts = null }) {
  const intro = texts?.intro ?? HELP_INTRO
  const faq = Array.isArray(texts?.faq) ? texts.faq : FAQ
  const done = Array.isArray(texts?.done) ? texts.done : DONE
  const guide = guideOf(texts)
  const [auto, setAuto] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const token = useRef(null)
  const panel = useRef(null)
  const titleId = useId()
  const howId = useId()
  const faqId = useId()
  const visible = !!open || auto

  // פתיחה לבד בפעם הראשונה — רק בדפדפן (localStorage), ולכן אחרי הטעינה
  useEffect(() => {
    if (!autoOpen) return undefined
    if (!token.current) token.current = {}
    const me = token.current
    if ((autoOwner && autoOwner !== me) || helpSeen()) return undefined
    autoOwner = me
    // eslint-disable-next-line react-hooks/set-state-in-effect -- המצב תלוי ב-localStorage, שאינו קיים ברינדור השרת
    setAuto(true)
    return () => {
      if (autoOwner === me) autoOwner = null
    }
  }, [autoOpen])

  const close = useCallback(() => {
    markSeen()
    setAuto(false)
    onClose?.()
  }, [onClose])

  // Esc סוגר רק את החלון הזה (בשלב-הלכידה, לפני העורך והחלונות שמתחתיו)
  useEffect(() => {
    if (!visible) return undefined
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [visible, close])

  if (!visible || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        dir="rtl"
        className="glass-strong flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-variant px-5 py-3">
          <h2 id={titleId} className="flex items-center gap-2 text-xl font-bold text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined text-primary">help</span>
            מה עושים בעמוד?
          </h2>
          <button onClick={close} aria-label="סגירה" title="סגירה (Esc)" className="rounded-full p-1.5 text-on-surface/60 transition-colors hover:bg-surface-variant hover:text-on-surface">
            <span aria-hidden="true" className="material-symbols-outlined block">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed text-on-surface/85">
          <p>{intro}</p>
          {guide && (
            <a
              href={guide.href}
              target="_blank"
              rel="noopener noreferrer"
              data-guide-link=""
              title={GUIDE_TITLE}
              onClick={(e) => {
                if (!guide.open) return
                e.preventDefault()
                openGuide(guide)
              }}
              className="flex items-center gap-2 rounded-lg border border-info-200 bg-info-50 px-3 py-2 font-bold text-info-800 hover:bg-info-100"
            >
              <span aria-hidden="true" className="material-symbols-outlined">menu_book</span>
              הנחיות להגהה — דף אחד קצר, עם תמונות
            </a>
          )}
          {texts?.extra}

          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary">{i + 1}</span>
                <div>
                  <div className="font-bold text-on-surface">{s.title}</div>
                  <div>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="rounded-lg bg-surface-variant/60 px-3 py-2">
            ואם שורה חתוכה לא נכון — שתי שורות בתיבה אחת, שורה שנחתכה באמצע, שורה שחסרה — עברו בסריקה למצב &quot;שורות&quot; ותקנו את
            החיתוך.
          </p>
          <p className="text-xs text-on-surface/70">{DISPLAY_NOTE}</p>

          <section aria-label="מה אומרים הסימונים על המילים">
            <div className="mb-1 font-bold text-on-surface">מה אומרים הסימונים על המילים</div>
            <ul className="space-y-1">
              {MARKS.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden="true" className="w-12 shrink-0 text-center font-medium">
                    {m.sample}
                  </span>
                  <span>{m.what}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-on-surface/70">
              מילה עם הצעות: העבירו עליה את העכבר (או הציבו עליה את הסמן ולחצו <Kbd>Alt+↓</Kbd>) ובחרו הצעה. המחשב לעולם לא מתקן לבד.
            </p>
          </section>

          {faq.length > 0 && (
            <section aria-labelledby={faqId} className="rounded-xl bg-info-50/60 px-3 py-2">
              <div id={faqId} className="mb-1 flex items-center gap-2 font-bold text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-info-700">help</span>
                שאלות שחוזרות
              </div>
              <dl className="space-y-1.5">
                {faq.map((f) => (
                  <div key={f.key} data-faq={f.key}>
                    <dt className="font-bold text-on-surface">{f.q}</dt>
                    <dd>{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="overflow-hidden rounded-xl border border-surface-variant">
            <button
              onClick={() => setHowOpen((v) => !v)}
              aria-expanded={howOpen}
              aria-controls={howId}
              className="flex w-full items-center justify-between px-3 py-2 font-bold text-on-surface transition-colors hover:bg-surface-variant/50"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-accent">keyboard</span>
                איך עושים — מקשים ועכבר
              </span>
              <span aria-hidden="true" className="material-symbols-outlined">{howOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {howOpen && (
              <div id={howId} className="space-y-3 border-t border-surface-variant px-3 py-3">
                <table className="w-full text-sm">
                  <tbody>
                    {KEYS.map((k) => (
                      <tr key={k.what} className="border-b border-surface-variant/60 last:border-0">
                        <td className="py-1.5 pl-3 align-top font-medium text-on-surface">{k.what}</td>
                        <td className="py-1.5 align-top">{k.how}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <section aria-label="סגנונות הפסקה">
                  <div className="mb-1 font-bold text-on-surface">סגנונות הפסקה (התפריט &quot;סגנון פסקה&quot; שבסרגל)</div>
                  <ul className="list-disc space-y-1 pr-5">
                    {PARA_STYLE_OPTIONS.map((o) => (
                      <li key={o.key}>
                        <b>{o.he}</b> — {o.hint}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-on-surface/70">הסגנון חל על כל הפסקה שבה הסמן. שמו מופיע בסרגל כשהסמן בפסקה.</p>
                </section>
                <div>
                  <div className="mb-1 font-bold text-on-surface">בסריקה</div>
                  <ul className="list-disc space-y-1 pr-5">
                    {SCAN.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {done.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-2 font-bold text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined text-success-600">task_alt</span>
                סיימתי — מה עכשיו?
              </div>
              <ul className="list-disc space-y-1 pr-5">
                {done.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-surface-variant px-5 py-3">
          <button onClick={close} className="rounded-lg bg-primary px-5 py-2 font-bold text-on-primary transition-opacity hover:opacity-90">
            הבנתי, מתחילים
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
