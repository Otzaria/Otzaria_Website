import ProgressBar from '@/components/ui/ProgressBar'
import { cx } from '@/components/ui/cx'
import { bookProgress, formatNumber, inProgressText, pagesText, progressText } from '@/lib/adminBooks/bookTerms'

/**
 * ההתקדמות של ספר בשורה: "120 מתוך 340 הושלמו" (ו"· 5 בעבודה" כשיש), ומתחת פס דק. ספר שהושלם —
 * "הושלם" בירוק ופס מלא. ספר בלי עמודים — רק הטקסט. המספרים בטקסט; הפס מחזק אותם.
 * ברשימה צרה (טלפון) — שורה אחת: "120/340 · 5 בעבודה" והפס לידו (השם המלא — בפס, לקורא המסך).
 * @param {{ book: any, className?: string }} props
 */
export default function BookProgress({ book, className }) {
  const p = bookProgress(book)
  const text = progressText(p)
  const done = p.stage === 'completed'
  return (
    <div className={cx('flex min-w-0 items-center gap-3 @2xl:flex-col @2xl:items-stretch @2xl:gap-1.5', className)}>
      {/* טלפון: קצר, בשורה אחת עם הפס */}
      <p aria-hidden="true" className="shrink-0 text-body-sm tabular-nums text-on-surface-variant @2xl:hidden">
        {done ? <span className="text-success">הושלם</span> : `${formatNumber(p.completed)}/${formatNumber(p.total)}`}
        {!done && p.inProgress > 0 && ` · ${inProgressText(p.inProgress)}`}
      </p>
      {/* ברשימה רחבה עד @4xl (העמודה צרה) "בעבודה" בשורה משלו ובלי נקודה — כדי שלא תתחיל שורה ב-"·";
          ברשימה רחבה מאוד — באותה שורה, אחרי נקודה */}
      <p className="flex flex-wrap gap-x-1 text-body-sm tabular-nums text-on-surface-variant @max-2xl:sr-only">
        {done ? (
          <><span className="text-success">הושלם</span> <span aria-hidden="true">·</span> {pagesText(p.total)}</>
        ) : (
          <>
            <span>{text}</span>
            {p.inProgress > 0 && (
              <span className="whitespace-nowrap @max-4xl:basis-full">
                <span aria-hidden="true" className="@max-4xl:hidden">· </span>{inProgressText(p.inProgress)}
              </span>
            )}
          </>
        )}
      </p>
      {p.total > 0 && (
        <ProgressBar
          value={p.completed}
          max={p.total}
          label={`התקדמות: ${book.name}`}
          valueText={done ? `הושלם, ${text}` : text}
          tone={done ? 'success' : 'primary'}
          className="@max-2xl:min-w-12 @max-2xl:flex-1"
        />
      )}
    </div>
  )
}
