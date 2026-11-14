import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'

// הכותרת הדביקה של מסך-סבב: שם החלק, "כל סימון נשמר מיד", חזרה לדף הבית, ופס-התקדמות
export default function RoundHeader({ title, done, total, onHome }) {
  const pct = total ? Math.round((100 * done) / total) : 0
  return (
    <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 bg-background px-1 pt-2 pb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-headline-md font-bold text-on-surface">{title}</h1>
          <span
            className="inline-flex items-center gap-1 rounded-lg bg-info-container px-2 py-0.5 text-label-md text-on-info-container"
            title="אם תצאו מהדף לפני שסיימתם, השורות שלא סימנתם יעברו למתנדב אחר. מה שכבר סימנתם נשמר."
          >
            <AppIcon name="check_circle" className="text-base" />
            כל סימון נשמר מיד · השורות שמורות לכם כל זמן שאתם בדף
          </span>
        </div>
        <Button variant="text" size="sm" icon="arrow_forward" onClick={onHome}>
          לדף הבית
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="התקדמות בסבב"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-label-md text-on-surface-variant tabular-nums">
          {done} מתוך {total}
        </span>
      </div>
    </div>
  )
}
