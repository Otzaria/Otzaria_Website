'use client'

import { handledItems } from '@/lib/pageProof/stages'

// "במה כבר טיפלתי" — לוח קטן ליד הסרגל, לשלב הנוכחי (docs/63 §3; stages.handledItems): במבנה — מסגרות אושרו ✓ ·
// חיתוך נבדק ✓ · תיקוני-חיתוך / נשלח לזיהוי-מחדש וחזר; בטקסט — פסקאות שאושרו N/M · שורות עם פגם בדפוס · סגנונות ·
// קישורים (מספרים מהטיוטה). מוצג בתוך כפתורי הדף בקצה הסרגל (ProofEditor actions).

export default function StagePanel({ stage, view, ops, approval, recut }) {
  const items = handledItems(stage, { view, ops, approval, recut })
  if (!items.length) return null
  return (
    <ul aria-label="במה כבר טיפלתי" data-testid="stage-panel" className="flex flex-wrap items-center gap-1 text-[11px]">
      {items.map((it) => (
        <li
          key={it.key}
          data-done={it.done === true ? '1' : it.done === false ? '0' : undefined}
          title={it.title || undefined}
          className={`flex items-center gap-0.5 whitespace-nowrap rounded-full border px-2 py-0.5 ${
            it.done === true
              ? 'border-success-200 bg-success-50 text-success-800'
              : it.done === false
                ? 'border-surface-variant bg-white text-on-surface/60'
                : 'border-info-200 bg-info-50 text-info-800'
          }`}
        >
          {it.done !== null && (
            <span aria-hidden="true" className="material-symbols-outlined text-sm leading-none">
              {it.done ? 'check_circle' : 'circle'}
            </span>
          )}
          {it.label}
        </li>
      ))}
    </ul>
  )
}
