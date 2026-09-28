'use client'

import { describeOp } from '@/lib/pageProof/ops'
import { OP_KINDS } from '@/lib/pageProof/vocab'
import { Section } from './LineTab'

// כרטיסיית "שינויים": כל הפעולות שייצאו בהגשה, בסדר, עם אפשרות לבטל כל אחת.
// פעולה שאינה עדיין בחוזה (פיצול/איחוד/הוספה/"נכונה") מסומנת — היא נשמרת
// ונשלחת, אבל תוכנת-הספר תקלוט אותה רק כשתתמוך בה.

export default function ChangesTab({ baseDoc, ops, readOnly, act }) {
  return (
    <div className="text-on-surface">
      <Section title={`${ops.length} פעולות`}>
        {!ops.length && <p className="text-xs text-on-surface/60">עוד לא נעשו שינויים בעמוד</p>}
        <ol className="space-y-1 text-sm">
          {ops.map((op, i) => (
            <li key={i} className="flex items-start gap-2 rounded bg-surface-variant/40 px-2 py-1">
              <span className="w-5 shrink-0 text-xs text-on-surface/50 tabular-nums">{i + 1}</span>
              <span className="flex-1">
                <span className="font-bold">{OP_KINDS[op.kind]?.he || op.kind}</span>
                {!OP_KINDS[op.kind]?.contract && <span className="mr-1 rounded bg-info-100 px-1 text-[10px] text-info-800">הצעה</span>}
                <span className="block text-xs text-on-surface/70">{describeOp(baseDoc, op)}</span>
              </span>
              {!readOnly && (
                <button onClick={() => act.removeOp(i)} className="text-xs text-danger-700 hover:underline" title="ביטול הפעולה הזו">
                  ✗
                </button>
              )}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
