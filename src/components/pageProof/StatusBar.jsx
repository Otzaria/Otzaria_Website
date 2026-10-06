'use client'

import { BOOK_ONLY_STATUS, BOOK_ONLY_TITLE_ON } from '@/lib/pageProof/helpTexts'

// שורת-המצב בתחתית העורך: איפה הסמן (שורה · זרם · מילה), כמה שינויים נעשו,
// כמה פסקאות אושרו, ורמז-רגע (למשל "זה סוף-שורה בסריקה — אי אפשר למחוק אותו
// כאן"). הרמז מוכרז גם לקוראי-מסך (aria-live).
//
// props: lineNo — מספר-השורה לתצוגה (כבר מ-1; אפשר גם מחרוזת, למשל "חדשה");
// streamHe — שם הזרם; wordIndex — מספר-המילה בשורה מ-0 (מוצג מ-1; -1/null =
// אין); opsCount — מספר הפעולות; approval — {approved, total} פסקאות; hint.

export function opsLabel(n) {
  const k = Number.isInteger(n) && n > 0 ? n : 0
  if (k === 0) return 'אין שינויים'
  if (k === 1) return 'שינוי אחד'
  return `${k} שינויים`
}

export function approvalLabel(approval) {
  const total = Number(approval?.total) || 0
  if (total <= 0) return null
  const approved = Math.max(0, Math.min(total, Number(approval?.approved) || 0))
  if (approved >= total) return total === 1 ? 'הפסקה אושרה' : `כל ${total} הפסקאות אושרו`
  return `אושרו ${approved} מתוך ${total} פסקאות`
}

function Sep() {
  return (
    <span className="text-neutral-300" aria-hidden="true">
      ·
    </span>
  )
}

// bookOnly — מצב "לספר בלבד" דולק: תווית קבועה בשורת-המצב (כדי שלא יישכח דולק)
export default function StatusBar({ lineNo = null, streamHe = null, wordIndex = null, opsCount = 0, approval = null, hint = null, bookOnly = false, className = '' }) {
  const parts = []
  if (lineNo != null && lineNo !== '') parts.push({ key: 'line', node: `שורה ${lineNo}` })
  if (streamHe) parts.push({ key: 'stream', node: streamHe })
  if (Number.isInteger(wordIndex) && wordIndex >= 0) parts.push({ key: 'word', node: `מילה ${wordIndex + 1}` })
  parts.push({ key: 'ops', node: opsLabel(opsCount), title: 'מספר השינויים שעשיתם בעמוד — כל אחד נשלח כחומר-לימוד' })

  const total = Number(approval?.total) || 0
  const approved = Math.max(0, Math.min(total, Number(approval?.approved) || 0))
  const done = total > 0 && approved >= total
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0

  return (
    <div dir="rtl" className={`flex h-8 min-w-0 items-center gap-2 border-t border-neutral-200 bg-white px-3 text-xs text-on-surface/70 ${className}`}>
      {parts.map((p, k) => (
        <span key={p.key} className="flex shrink-0 items-center gap-2" title={p.title}>
          {k > 0 && <Sep />}
          <span>{p.node}</span>
        </span>
      ))}

      {total > 0 && (
        <span className="flex shrink-0 items-center gap-2" title="פסקאות שאישרתם כנכונות (Ctrl+Enter מאשר את הפסקה שבה הסמן)">
          <Sep />
          <span
            className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200"
            role="progressbar"
            aria-label="פסקאות שאושרו"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={approved}
          >
            <span className={`block h-full rounded-full ${done ? 'bg-success-600' : 'bg-success-500'}`} style={{ width: `${pct}%` }} />
          </span>
          <span className={done ? 'font-bold text-success-700' : ''}>{approvalLabel(approval)}</span>
          {done && (
            <span className="material-symbols-outlined text-sm text-success-600" aria-hidden="true">check_circle</span>
          )}
        </span>
      )}

      {bookOnly && (
        <span data-testid="book-only-status" className="flex shrink-0 items-center gap-1 rounded bg-warning-100 px-2 font-bold text-warning-800" title={BOOK_ONLY_TITLE_ON}>
          <span className="material-symbols-outlined text-sm" aria-hidden="true">flag</span>
          {BOOK_ONLY_STATUS}
        </span>
      )}

      <span className="ms-auto min-w-0 truncate text-on-surface/60" aria-live="polite" title={typeof hint === 'string' ? hint : undefined}>
        {hint}
      </span>
    </div>
  )
}
