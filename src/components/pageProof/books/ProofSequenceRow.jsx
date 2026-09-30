'use client'

import { useDialog } from '@/components/providers/DialogContext'
import { canClaim, seqClaimLabel, SEQ_HINT, CLAIM_HOURS } from '@/lib/pageProof/gridState'

// שורה אחת בתצוגה "ברצפים של 5": כותרת הרצף עם "תפוס את 5 העמודים" (שואל
// קודם), ומתחתיה הכרטיסים של הרצף. group — מ-groupBySequence (כל עמודי
// הרצף — לספירת הפנויים); children — הכרטיסים שעוברים את הסינון.

export default function ProofSequenceRow({ group, canClaimNew = true, busy = false, onClaimSequence, gridClass, children }) {
  const { showConfirm } = useDialog()
  const free = group.pages.filter((p) => canClaim(p.state)).length
  const canTake = canClaimNew && free > 0 && group.seq !== null && !!onClaimSequence
  const range = group.first === group.last ? `עמוד ${group.first}` : `עמודים ${group.first}–${group.last}`

  const ask = () =>
    showConfirm(
      `רצף ${group.seq + 1} · ${range}`,
      `${free === 1 ? 'העמוד הפנוי ברצף יישמר' : `${free} העמודים הפנויים ברצף יישמרו`} עבורכם ל-${CLAIM_HOURS} שעות.\n${SEQ_HINT}`,
      () => onClaimSequence(group),
      seqClaimLabel(free, group.pages.length),
      'ביטול'
    )

  return (
    <section className="rounded-xl border border-surface-variant/50 bg-surface/40 p-3" aria-label={`רצף ${range}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-on-surface">{group.seq !== null ? `רצף ${group.seq + 1}` : 'עמודים'}</span>
          <span className="text-on-surface/60">· {range}</span>
          {free > 0 && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
              {free === 1 ? 'פנוי אחד' : `${free} פנויים`}
            </span>
          )}
        </div>
        {canTake && (
          <button
            type="button"
            onClick={ask}
            disabled={busy}
            title={SEQ_HINT}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-on-primary transition-colors hover:bg-accent disabled:opacity-50"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">playlist_add</span>
            <span>{seqClaimLabel(free, group.pages.length)}</span>
          </button>
        )}
      </div>
      <div className={gridClass}>{children}</div>
    </section>
  )
}
