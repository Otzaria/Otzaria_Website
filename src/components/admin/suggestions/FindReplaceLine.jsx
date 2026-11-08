import AppIcon from '@/components/ui/AppIcon'

/** בהצעת חיפוש והחלפה: מה מחפשים ובמה מחליפים ("שרש ← שורש"); החלפה בכלום — "מחיקה" */
export default function FindReplaceLine({ findReplace }) {
  const chip = 'rounded-(--radius-control) bg-surface-container px-2 py-0.5 text-body-sm text-on-surface'
  return (
    <p className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
      <span>מחליף</span>
      <bdi className={chip}>{findReplace.find}</bdi>
      <AppIcon name="arrow_back" className="text-icon-md" />
      {findReplace.replace ? <bdi className={chip}>{findReplace.replace}</bdi> : <span className={chip}>מחיקה</span>}
      {findReplace.isRegex && <span>(תבנית חיפוש מתקדמת)</span>}
    </p>
  )
}
