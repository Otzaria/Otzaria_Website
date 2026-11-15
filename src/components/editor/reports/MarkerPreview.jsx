import { markerDiff } from './reportLogic'

/**
 * תצוגה מקדימה של הסימון שייכנס לטקסט: (הטקסט שבספר)[התיקון המוצע], עם הדגשת מה שהשתנה —
 * מה שנמחק בצד המקור ומה שנוסף בצד התיקון. ל-del/ins יש משמעות גם לקורא המסך.
 * @param {{ original: string, proposed: string, id?: string }} props
 */
export default function MarkerPreview({ original, proposed, id }) {
  const diff = markerDiff(original, proposed)
  return (
    <p
      id={id}
      dir="rtl"
      aria-live="polite"
      className="break-words rounded-(--radius-control) bg-surface px-4 py-3 font-mono text-body-lg leading-relaxed text-on-surface"
    >
      <span className="text-on-surface-variant">(</span>
      {diff.prefix}
      {diff.removed && <del className="rounded-(--radius-xs) bg-error-container px-0.5 text-on-error-container">{diff.removed}</del>}
      {diff.suffix}
      <span className="text-on-surface-variant">)[</span>
      {diff.prefix}
      {diff.added && <ins className="rounded-(--radius-xs) bg-success-container px-0.5 text-on-success-container no-underline">{diff.added}</ins>}
      {diff.suffix}
      <span className="text-on-surface-variant">]</span>
    </p>
  )
}
