'use client'

import { memo, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import * as Figures from './GuideFigures'
import { GUIDE_FIGURES } from '@/lib/pageProof/guideFigures'

// גוף דף ההנחיות להגהת עמודים: HTML שכבר נוקה והקודים בו הוחלפו (guideContent.renderGuide) — מהנוסח המקורי, או מהנוסח
// שנשמר בדף הניהול. העיצוב — לפי התגיות (פרק = כרטיס, כותרת עם אייקון, רשימות ממוספרות, kbd, "note"/"muted"/"lead").
// האיורים: renderGuide משאיר במקום כל [[איור:…]] מקום-שמור (data-guide-figure), והרכיב ממלא אותו באיור עצמו — שורש-React
// קטן לכל איור (createRoot), כי התוכן סביבו הוא HTML שאינו בידי React (portal לתוכו לא נשאר).
// משמש גם לתצוגה-המקדימה בדף הניהול (GuideEditorCard).

const BODY = [
  'space-y-8 text-lg leading-relaxed text-on-surface/85',
  // פרק = כרטיס
  '[&_section]:scroll-mt-24 [&_section]:space-y-4 [&_section]:rounded-xl [&_section]:border [&_section]:border-surface-variant',
  '[&_section]:bg-background/95 [&_section]:p-6 md:[&_section]:p-8',
  '[&_h2]:mb-4 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-primary-dark',
  '[&_h2_.material-symbols-outlined]:text-3xl [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-on-surface',
  '[&_ol]:list-decimal [&_ol]:space-y-4 [&_ol]:pr-6 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pr-6',
  '[&_li>p]:mt-2 [&_p.note]:rounded-lg [&_p.note]:bg-warning-alt-50 [&_p.note]:px-3 [&_p.note]:py-2 [&_p.note]:text-base',
  '[&_p.muted]:text-base [&_p.muted]:text-on-surface/70 [&_p.lead]:text-center [&_p.lead]:text-xl [&_p.lead]:text-on-surface/75',
  '[&_kbd]:whitespace-nowrap [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-surface-variant [&_kbd]:bg-surface [&_kbd]:px-1.5',
  '[&_kbd]:py-0.5 [&_kbd]:font-sans [&_kbd]:text-sm [&_kbd]:font-bold',
  '[&_a]:font-bold [&_a]:text-primary hover:[&_a]:underline',
  '[&_[data-guide-figure]]:mt-3 [&_[data-guide-figure]]:block',
].join(' ')

// שורש לכל מקום-שמור — פעם אחת (במצב-פיתוח React מריץ את האפקט פעמיים על אותו DOM)
const ROOTS = new WeakMap()

function GuideBody({ html, className = '' }) {
  const ref = useRef(null)

  // אחרי כל החלפת תוכן — איור בכל מקום-שמור; מקום שכבר אינו בדף (התוכן הוחלף, או יציאה) — מפרקים
  useLayoutEffect(() => {
    const nodes = ref.current ? [...ref.current.querySelectorAll('[data-guide-figure]')] : []
    const used = []
    for (const node of nodes) {
      const Fig = Figures[GUIDE_FIGURES[node.getAttribute('data-guide-figure')]]
      if (!Fig) continue
      let root = ROOTS.get(node)
      if (!root) {
        root = createRoot(node)
        ROOTS.set(node, root)
      }
      root.render(<Fig />)
      used.push(node)
    }
    return () => {
      // אחרי הרינדור הנוכחי — React אינו מרשה לפרק שורש באמצע רינדור
      setTimeout(() => {
        for (const node of used) {
          if (node.isConnected) continue
          ROOTS.get(node)?.unmount()
          ROOTS.delete(node)
        }
      }, 0)
    }
  }, [html])

  return <div ref={ref} className={`${BODY} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}

// אותו html — אותו DOM (בלי רינדור-מחדש שהיה מוחק את האיורים)
export default memo(GuideBody)
