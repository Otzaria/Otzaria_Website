'use client'

import { useState } from 'react'
import { SCRIPTS, CERTAINTY, isPrintDefect, streamInfo } from '@/lib/pageProof/vocab'
import { RECUT_LINE_TITLE } from '@/lib/pageProof/helpTexts'

// כרטיסיית "שורה" בלוח הפרטים: מה שנשאר ברמת השורה שבה הסמן — כתב, שורה
// מעורבת-כתבים, ודאות (עם הסבר), "נכונה כפי שהיא" / "לא-שורה", ומה המערכת
// חשבה (pred). הזרם, סגנון-הפסקה וסגנונות-התו — בסרגל-הכלים שלמעלה.

const btn = 'rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-40'
const soft = `${btn} bg-surface-variant/60 hover:bg-surface-variant`
const pick = (on) => `${btn} ${on ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`

export function Section({ title, children, hint }) {
  return (
    <section className="border-b border-surface-variant py-3">
      <h3 className="mb-2 text-sm font-bold text-on-surface/80" title={hint}>
        {title}
      </h3>
      {children}
    </section>
  )
}

function PredCard({ line }) {
  const pred = line?.pred || {}
  const keys = Object.keys(pred)
  if (!keys.length) return null
  const show = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <Section title="מה המערכת חשבה" hint="הניחוש, הביטחון והנימוק — נשמרים גם כשמתקנים">
      <dl className="space-y-1 text-xs">
        {keys.map((k) => (
          <div key={k} className="rounded bg-surface-variant/40 px-2 py-1">
            <dt className="font-bold">
              {k}: <span className="font-normal">{show(pred[k]?.v)}</span>
              {typeof pred[k]?.conf === 'number' && <span className="text-on-surface/50"> · {Math.round(pred[k].conf * 100)}%</span>}
            </dt>
            {pred[k]?.why && <dd className="text-on-surface/60">{pred[k].why}</dd>}
          </div>
        ))}
      </dl>
    </Section>
  )
}

// line — השורה שבה הסמן (מהתצוגה); locked — ממתינה לזיהוי מחדש; lockTitle — ההסבר עליה (ברירת-מחדל: של האתר)
export default function LineTab({ view, line, locked = false, readOnly = false, act, lockTitle }) {
  const [why, setWhy] = useState('')
  if (!line) {
    return <div className="py-6 text-center text-sm text-on-surface/60">הציבו את הסמן בשורה בטקסט (או לחצו עליה בסריקה) כדי לראות את פרטיה</div>
  }
  const temp = !(line.id > 0) || !!line._new
  const dis = readOnly || temp
  const s = streamInfo(view, line.stream)

  return (
    <div className="text-on-surface">
      <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <b>{temp ? 'שורה חדשה' : `שורה ${(line.line_no ?? 0) + 1}`}</b>
        <span className="rounded px-1.5 text-xs text-white" style={{ background: s.color }} title={`מקור הזרם: ${line.stream_src || 'auto'}`}>
          {s.he}
          {s.heading ? ' · כותרת' : ''}
        </span>
        {line.status === 'fixed' && <span className="rounded bg-success-100 px-1.5 text-xs text-success-800">תוקנה</span>}
        {line._ok && <span className="rounded bg-success-100 px-1.5 text-xs text-success-800">✓ נכונה</span>}
        {isPrintDefect(line) && (
          <span className="rounded bg-warning-100 px-1.5 text-xs text-warning-800" title="תוקנה למה שאמור להיות בספר — נכנסת לספר, לא לאימון">
            פגם בדפוס
          </span>
        )}
        {line.recheck === true && <span className="rounded bg-warning-alt-100 px-1.5 text-xs text-warning-alt-900">זוהתה מחדש</span>}
        {(locked || temp) && (
          <span className="rounded bg-warning-100 px-1.5 text-xs text-warning-800" title={lockTitle || RECUT_LINE_TITLE}>
            ממתינה לזיהוי מחדש
          </span>
        )}
      </div>
      {temp && <p className="pb-2 text-xs text-info-700">השורה נוצרה בתיקון החיתוך — היא תיחתך ותיקרא בתוכנה, ואז תחזור להגהה.</p>}

      <Section title="כתב">
        <div className="flex flex-wrap gap-1">
          {Object.entries(SCRIPTS).map(([k, v]) => (
            <button key={k} type="button" disabled={dis} onClick={() => act.script(k)} className={pick(line.script === k)}>
              {v}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={dis} checked={!!line.flags?.mixed_line} onChange={(e) => act.mixed(e.target.checked)} />
          שורה מעורבת-כתבים
        </label>
      </Section>

      <Section title="ודאות" hint="עדיף סימון-עמימות על ניחוש — הלמידה מתעלמת מעמומים">
        <div className="flex flex-wrap gap-1">
          {Object.entries(CERTAINTY).map(([k, v]) => (
            <button
              key={k}
              type="button"
              disabled={dis || (k === 'ambiguous' && !why.trim())}
              onClick={() => act.certainty(k, k === 'ambiguous' ? why.trim() : null)}
              className={pick(line.certainty === k)}
            >
              {v}
            </button>
          ))}
        </div>
        <input
          value={why}
          disabled={dis}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={300}
          placeholder='למה לא בטוח? (חובה ל"לא בטוח")'
          className="mt-2 w-full rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
        />
        {line.certainty_why && <p className="mt-1 text-xs text-on-surface/60">ההסבר שנשמר: {line.certainty_why}</p>}
        {act.printDefect && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={dis} onClick={act.printDefect} className={pick(isPrintDefect(line))}>
              פגם בדפוס
            </button>
            <span className="text-xs text-on-surface/60">תיקנתי למה שאמור להיות כתוב בספר, לא למה שבסריקה — נכנס לספר, לא לאימון</span>
          </div>
        )}
      </Section>

      <Section title="השורה עצמה">
        <div className="flex flex-wrap gap-1">
          <button type="button" disabled={dis || locked || !!line._ok} onClick={act.lineOk} className={`${btn} bg-success-100 text-success-800 hover:bg-success-200`} title="בדקתי — הטקסט של השורה נכון כפי שהוא">
            ✓ נכונה כפי שהיא
          </button>
          <button type="button" disabled={dis} onClick={act.remove} className={soft} title="התיבה אינה טקסט (כתם, קישוט, רעש) — היא תוסר מהטקסט; שחזור בכרטיסיית 'עמוד'">
            לא-שורה (הסרה)
          </button>
        </div>
        <p className="mt-1 text-xs text-on-surface/60">קו מפריד (גם מעוטר) שנקרא כטקסט — לא &quot;לא-שורה&quot;, אלא זרם &quot;מפריד&quot; (בסרגל: התפריט &quot;זרם&quot;).</p>
      </Section>

      <PredCard line={line} />
    </div>
  )
}
