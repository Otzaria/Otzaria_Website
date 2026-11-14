'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { GUIDE_SECTIONS, guideHref } from './labels'

// עזרה קצרה לכל מסלול (כמו ProofHelp של הגהת העמודים): 3–4 שקופיות. נפתחת לבד בביקור הראשון
// במסלול (כל עוד אין את המפתח ב-localStorage), וכפתור "?" (HelpButton) פותח אותה שוב.

export const HELP_KEYS = {
  fast: 'tzuratHadaf.help.fast',
  review: 'tzuratHadaf.help.review',
}

function Kbd({ children }) {
  return (
    <kbd dir="ltr" className="whitespace-nowrap rounded border border-outline-variant bg-surface px-1.5 py-0.5 font-sans text-xs font-bold text-on-surface">
      {children}
    </kbd>
  )
}

export const HELP_SLIDES = {
  fast: [
    {
      title: 'מה עושים כאן',
      icon: 'auto_stories',
      body: (
        <p>
          המחשב בנה את דף הגמרא מהטקסט של אוצריא, ובמקומות מסוימים הוא לא בטוח מה נדפס בדפוס וילנא. בכל כרטיס מוצג קטע מהסריקה של
          הדפוס, והמקום מוקף במסגרת אדומה. אתם רק מסתכלים ובוחרים מה כתוב שם.
        </p>
      ),
    },
    {
      title: 'איך עונים',
      icon: 'quiz',
      body: (
        <ul className="list-disc space-y-1 pr-5">
          <li>בחרו את האפשרות שכתובה בסריקה, אות באות — גם ראשי תיבות וכתיב חסר או מלא.</li>
          <li>כתוב משהו אחר? הקלידו אותו בשדה &quot;משהו אחר&quot;.</li>
          <li>לא רואים טוב? &quot;לא ברור מהסריקה&quot;, או &quot;הצג את כל העמוד&quot;. המסגרת לא במקום? &quot;החיתוך לא מראה את המקום&quot;.</li>
        </ul>
      ),
    },
    {
      title: 'מקשים',
      icon: 'keyboard',
      body: (
        <ul className="space-y-1">
          <li>
            <Kbd>1</Kbd>–<Kbd>4</Kbd> בחירת אפשרות · <Kbd>Enter</Kbd> שמירה · <Kbd>N</Kbd> דילוג
          </li>
          <li>
            <Kbd>O</Kbd> משהו אחר · <Kbd>U</Kbd> לא ברור
          </li>
        </ul>
      ),
    },
    {
      title: 'מה קורה אחר כך',
      icon: 'task_alt',
      body: (
        <p>
          כל שאלה נשאלת שני מתנדבים, בלי שאחד רואה את תשובת השני. כשהשניים מסכימים — ההכרעה נכנסת לצורת הדף, וכל אחד מקבל נקודה.
          כשאינם מסכימים — מנהל מכריע. לכן לא מוצג לכם אם צדקתם: עדיף לענות &quot;לא ברור&quot; מאשר לנחש.
        </p>
      ),
    },
  ],
  review: [
    {
      title: 'בדיקת עמוד שלם',
      icon: 'auto_stories',
      body: (
        <p>
          כאן בודקים עמוד אחד מול הסריקה של וילנא, בארבעה שלבים. העמוד שמור לכם 48 שעות (שבת וחג אינם נספרים), והעבודה נשמרת
          בשרת תוך כדי — אפשר לסגור ולחזור.
        </p>
      ),
    },
    {
      title: 'מבט כללי ושורות',
      icon: 'view_agenda',
      body: (
        <ul className="list-disc space-y-1 pr-5">
          <li>מבט כללי: הסריקה והעמוד שלנו זה לצד זה. ריחוף על שורה מסמן אותה בשני הצדדים. סמנו לכל בדיקה &quot;תקין&quot; או &quot;יש בעיה&quot;.</li>
          <li>שורות: מעל כל שורה שלנו — אותה שורה מהסריקה. שורה שמתחילה או נגמרת אחרת — הזיזו מילה למעלה או למטה, או לחצו על מילה ובחרו &quot;השורה מתחילה כאן&quot;.</li>
        </ul>
      ),
    },
    {
      title: 'נוסח ודיווחים',
      icon: 'text_fields',
      body: (
        <ul className="list-disc space-y-1 pr-5">
          <li>נוסח: השאלות של העמוד, כמו במסלול המהיר. מילה שבדפוס כתובה אחרת ואין עליה שאלה — &quot;בדפוס כתוב אחרת&quot;.</li>
          <li>דיווח: מה שאי אפשר לתקן בשלבים — גוש במקום שגוי, טקסט חסר או עודף, כותרת. סמנו מלבן על הסריקה או על העמוד שלנו.</li>
        </ul>
      ),
    },
    {
      title: 'הגשה',
      icon: 'send',
      body: (
        <p>
          בסוף — סיכום של מה ששיניתם, והגשה. מנהל בודק כל הגשה; הגשה שאושרה מזכה ב-10 נקודות. השינויים ייראו בעמוד אחרי הבנייה
          הבאה של צורת הדף.
        </p>
      ),
    },
  ],
}

const HELP_GUIDE = { fast: GUIDE_SECTIONS.fast, review: GUIDE_SECTIONS.lines }

export function helpSeen(track) {
  try {
    return window.localStorage.getItem(HELP_KEYS[track]) != null
  } catch {
    // אחסון חסום — עדיף לא לפתוח לבד בכל כניסה
    return true
  }
}

function markSeen(track) {
  try {
    window.localStorage.setItem(HELP_KEYS[track], '1')
  } catch {
    /* אחסון חסום */
  }
}

/** חלון העזרה של מסלול. open/onClose — פתיחה יזומה; autoOpen — פתיחה לבד בביקור הראשון */
export default function HelpDialog({ track, open = false, onClose, autoOpen = true }) {
  const [auto, setAuto] = useState(false)
  const [i, setI] = useState(0)
  const slides = HELP_SLIDES[track] || []

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen && !helpSeen(track)) setAuto(true)
  }, [autoOpen, track])

  if (!(open || auto) || !slides.length) return null
  const s = slides[Math.min(i, slides.length - 1)]
  const last = i >= slides.length - 1
  const close = () => {
    markSeen(track)
    setAuto(false)
    setI(0)
    onClose?.()
  }

  return (
    <Dialog
      title={s.title}
      subtitle={`${i + 1} מתוך ${slides.length}`}
      onClose={close}
      footer={
        <>
          <a href={guideHref(HELP_GUIDE[track])} target="_blank" rel="noopener noreferrer" className="me-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <span aria-hidden="true" className="material-symbols-outlined text-base">menu_book</span>
            ההנחיות המלאות
          </a>
          {i > 0 && (
            <Button variant="text" onClick={() => setI(i - 1)}>
              הקודם
            </Button>
          )}
          {last ? <Button onClick={close}>הבנתי, מתחילים</Button> : <Button onClick={() => setI(i + 1)}>הבא</Button>}
        </>
      }
    >
      <div className="flex items-start gap-3 text-base leading-relaxed text-on-surface/85">
        <span aria-hidden="true" className="material-symbols-outlined text-4xl text-primary">{s.icon}</span>
        <div className="flex-1">{s.body}</div>
      </div>
    </Dialog>
  )
}

/** כפתור "?" שפותח את העזרה */
export function HelpButton({ onClick }) {
  return (
    <Button variant="tonal" size="sm" icon="help" onClick={onClick} aria-label="עזרה">
      עזרה
    </Button>
  )
}
