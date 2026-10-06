'use client'

import { describeOp } from '@/lib/pageProof/ops'
import { OP_KINDS } from '@/lib/pageProof/vocab'
import { Section } from './LineTab'

// כרטיסיית "שינויים": כל הפעולות שייצאו בהגשה, בסדר, עם אפשרות לבטל כל אחת.
// פעולה שאינה עדיין בחוזה (פיצול/איחוד/הוספה/"נכונה") מסומנת — היא נשמרת
// ונשלחת, אבל תוכנת-הספר תקלוט אותה רק כשתתמוך בה.
// inherited (רשות) — {idx: Set(מקומות ב-ops), label}: הפעולות שהטיוטה קיבלה ממישהו אחר (הבודק השני בדף המתנדב — ההגשה
// הקודמת; עמוד שנפתח מחדש — הגרסה שאושרה). הן ברשימה נפרדת, כל אחת עם "החזר למקור" (act.revertInherited) והטקסט המקורי
// בריחוף; השאר — "השינויים שלכם". בלעדיו — רשימה אחת, כמו תמיד.

function OpItem({ op, i, n, baseDoc, readOnly, act, inherited = false }) {
  const line = inherited && op.kind === 'text' ? (baseDoc?.lines || []).find((l) => l?.id === op.ids?.[0]) : null
  const original = line ? String(line.text ?? line.text_ocr ?? '') : null
  return (
    <li className={`flex items-start gap-2 rounded px-2 py-1 ${inherited ? 'bg-info-50' : 'bg-surface-variant/40'}`} data-inherited={inherited ? '1' : undefined}>
      <span className="w-5 shrink-0 text-xs text-on-surface/50 tabular-nums">{n}</span>
      <span className="flex-1" title={original != null ? `במקור: «${original}»` : undefined}>
        <span className="font-bold">{OP_KINDS[op.kind]?.he || op.kind}</span>
        {!OP_KINDS[op.kind]?.contract && <span className="mr-1 rounded bg-info-100 px-1 text-[10px] text-info-800">הצעה</span>}
        <span className="block text-xs text-on-surface/70">{describeOp(baseDoc, op)}</span>
      </span>
      {!readOnly &&
        (inherited ? (
          <button onClick={() => act.revertInherited?.(i)} className="whitespace-nowrap text-xs text-info-800 hover:underline" title="ביטול השינוי — חזרה למה שהיה בעמוד לפניו (Ctrl+Z מחזיר)">
            החזר למקור
          </button>
        ) : (
          <button onClick={() => act.removeOp(i)} className="text-xs text-danger-700 hover:underline" title="ביטול הפעולה הזו">
            ✗
          </button>
        ))}
    </li>
  )
}

export default function ChangesTab({ baseDoc, ops, readOnly, act, inherited = null }) {
  const idx = inherited?.idx instanceof Set && inherited.idx.size ? inherited.idx : null
  if (!idx) {
    return (
      <div className="text-on-surface">
        <Section title={`${ops.length} פעולות`}>
          {!ops.length && <p className="text-xs text-on-surface/60">עוד לא נעשו שינויים בעמוד</p>}
          <ol className="space-y-1 text-sm">
            {ops.map((op, i) => (
              <OpItem key={i} op={op} i={i} n={i + 1} baseDoc={baseDoc} readOnly={readOnly} act={act} />
            ))}
          </ol>
        </Section>
      </div>
    )
  }
  const theirs = ops.map((op, i) => ({ op, i })).filter(({ i }) => idx.has(i))
  const mine = ops.map((op, i) => ({ op, i })).filter(({ i }) => !idx.has(i))
  return (
    <div className="text-on-surface">
      <Section title={`${inherited.label || 'תוקן בידי מתנדב קודם'} — ${theirs.length}`}>
        <p className="mb-1 text-xs text-on-surface/60">השורות האלה מסומנות בטקסט בקו מנוקד. אפשר לתקן אותן כרגיל, או להחזיר שינוי למקור.</p>
        <ol className="space-y-1 text-sm" aria-label="השינויים שהתקבלו">
          {theirs.map(({ op, i }, k) => (
            <OpItem key={i} op={op} i={i} n={k + 1} baseDoc={baseDoc} readOnly={readOnly} act={act} inherited />
          ))}
        </ol>
      </Section>
      <Section title={`השינויים שלכם — ${mine.length}`}>
        {!mine.length && <p className="text-xs text-on-surface/60">עוד לא שיניתם דבר מעבר לזה</p>}
        <ol className="space-y-1 text-sm" aria-label="השינויים שלכם">
          {mine.map(({ op, i }, k) => (
            <OpItem key={i} op={op} i={i} n={k + 1} baseDoc={baseDoc} readOnly={readOnly} act={act} />
          ))}
        </ol>
      </Section>
    </div>
  )
}
