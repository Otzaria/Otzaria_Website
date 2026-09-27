'use client'

import { useState } from 'react'

// הנחיות הגהת-העמודים — מקוצר ממדריך-התיוג של פרויקט ה-OCR (docs/35 §3) ומדף
// ההוראות (docs/38, docs/41 §9). מוצג מעל העורך, מתקפל.

const RULES = [
  'המחשב כבר קרא את העמוד וניחש את המבנה — אתם רק בודקים ומתקנים. כל תיקון נבדק בידי מנהל לפני שהוא חוזר לפרויקט.',
  'טקסט: לחיצה-כפולה על שורה לעריכה (Enter לשמירה, Esc לביטול). מילה עם קו כחול מנוקד / רקע סגול או כתום — העבירו עליה את העכבר לראות הצעות. אף פעם לא מוחלף משהו בלי שבחרתם.',
  'קו אדום מקווקו מתחת למילה = המחשב לא בטוח בה. בדקו מול הסריקה.',
  'זרמים: בחרו שורה ולחצו מקש 1–9 (או כפתור בלשונית "שורה"). לתיוג מהיר של אזור שלם — לשונית "מסגרות": "מסגרות מהזיהוי" ואז תיקון.',
  'שני טורים של אותו טקסט = שתי מסגרות באותו זרם (ימין 1, שמאל 2). כותרת-רצה, מספר-עמוד ושומר-דף = ריהוט (כותרת עמוד / תחתית).',
  'שורה שנחתכה על פני שני טורים — אל תרחיבו מסגרת כדי לתפוס אותה; פצלו אותה (לשונית "שורה" ← פיצול).',
  'תיבה שאינה שורה (כתם, קישוט) — "לא-שורה" או Delete. שורה שהחיתוך פספס — לשונית "עמוד" ← הוספת שורה.',
  'לא בטוחים? סמנו "לא בטוח" וכתבו למה. עדיף סימון-עמימות על ניחוש.',
  'בסיום: "כל השאר נכון" (לשונית "עמוד") — רק אחרי שקראתם באמת — ואז "הגשת העמוד". Ctrl+Z מבטל פעולה, והטיוטה נשמרת בדפדפן עד ההגשה.',
]

export default function ProofRules({ defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass-strong overflow-hidden rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 font-bold text-on-surface transition-colors hover:bg-surface-variant/50"
      >
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-warning-alt-600">gavel</span>
          איך מגיהים ומתייגים — כדאי לקרוא לפני שמתחילים
        </span>
        <span className="material-symbols-outlined">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <ol className="list-decimal space-y-1 px-6 pb-3 pr-10 text-sm leading-relaxed text-on-surface/80">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
