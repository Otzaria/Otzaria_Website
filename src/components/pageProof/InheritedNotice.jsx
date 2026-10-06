'use client'

import { inheritedHeadline } from '@/lib/pageProof/draftRules'

// הטיוטה של העמוד באה ממישהו אחר (docs/63 §2, §4, §5) — inherited מהטיוטה שבשרת: {source, byName, count, basedOn}.
//   draft      — העמוד עבר ממתנדב אחר (התפיסה שלו פגה, או מנהל שחרר): "ממשיכים מהעבודה של מתנדב קודם (N שינויים)";
//   submission — הבודק השני: מתחילים מההגשה של המתנדב הקודם;
//   approved   — מנהל פתח מחדש עמוד שאושר: מתחילים מהגרסה המאושרת.
// השינויים שהתקבלו מסומנים בעורך (ובלוח הפרטים ← שינויים — כל אחד אפשר לשנות או להחזיר למקור). "התחל מאפס"
// (onReset) — מתחילים מהעמוד כפי שהוא, בלי מה שהתקבל. onClose — סגירת ההודעה בלבד.

export default function InheritedNotice({ inherited, onReset, onClose, busy = false }) {
  if (!inherited) return null
  const { title, body } = inheritedHeadline(inherited)
  return (
    <div role="status" aria-label="ממשיכים מעבודה קודמת" className="flex items-start gap-2 rounded-xl border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-900" data-testid="inherited-notice">
      <span aria-hidden="true" className="material-symbols-outlined">group</span>
      <div className="flex-1">
        <p>
          <b>{title}</b> {body}
        </p>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          title="מתחילים מהעמוד כפי שהוא, בלי השינויים שהתקבלו (אפשר גם לבטל כל שינוי לבד — בלוח הפרטים ← שינויים)"
          className="flex shrink-0 items-center gap-1 rounded-lg border border-info-300 bg-white px-3 py-1 text-xs font-bold text-info-800 hover:bg-info-100 disabled:opacity-40"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">restart_alt</span>
          התחל מאפס
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="סגירת ההודעה" className="rounded-full p-1 text-info-800 hover:bg-info-100">
          <span aria-hidden="true" className="material-symbols-outlined block text-base">close</span>
        </button>
      )}
    </div>
  )
}
