'use client'

// הטיוטה של העמוד נשמרה בינתיים בלשונית או במחשב אחר, וגם כאן יש עבודה שלא נשמרה באתר — ובשתיהן שינויים שונים על
// אותן שורות (draftRules.applyServerDraft ← conflict). לפני שהעורך נפתח שואלים מה ממשיכים: מה שכאן, מה שבאתר, או
// האיחוד (מה שבאתר, ועליו מה שכאן — במקום סותר מה שכאן גובר).
// conflict = {n (מספר הסתירות), mine (שינויים שיש רק כאן), theirs (שינויים שיש רק באתר)} · onChoose('mine' | 'server' | 'merge')

const count = (n) => (Number(n) === 1 ? 'שינוי אחד' : `${Number(n) || 0} שינויים`)

export default function DraftConflictNotice({ conflict, onChoose }) {
  if (!conflict) return null
  return (
    <div role="alertdialog" aria-label="שתי גרסאות של הטיוטה" className="flex flex-col gap-3 rounded-xl border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-900" data-testid="draft-conflict">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="material-symbols-outlined">sync_problem</span>
        <div className="flex-1">
          <p>
            <b>העבודה על העמוד נשמרה בינתיים בלשונית או במחשב אחר.</b> כאן יש {count(conflict.mine)} שלא הגיעו לאתר, ובאתר{' '}
            {count(conflict.theirs)} שאינם כאן — ו-{conflict.n === 1 ? 'אחד מהם סותר' : `${conflict.n} מהם סותרים`} (אותה שורה, ערך אחר).
          </p>
          <p className="mt-1">ממה ממשיכים?</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChoose('merge')} className="rounded-lg bg-primary-600 px-3 py-1.5 font-bold text-white hover:bg-primary-700">
          לאחד את שתיהן (במקום סותר — מה שכאן)
        </button>
        <button type="button" onClick={() => onChoose('mine')} className="rounded-lg border border-warning-400 px-3 py-1.5 hover:bg-warning-100">
          רק מה שכאן
        </button>
        <button type="button" onClick={() => onChoose('server')} className="rounded-lg border border-warning-400 px-3 py-1.5 hover:bg-warning-100">
          רק מה שבאתר
        </button>
      </div>
    </div>
  )
}
