import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'

// סוף הסבב: "קח 30 נוספות" רק אחרי שכל השורות טופלו (ה-4); עד אז — ההסבר מה קורה ביציאה
export default function RoundEnd({ done, total, summary, onMore, onStop, loading }) {
  const finished = total > 0 && done >= total
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl bg-(--card-bg) p-6 text-center" aria-live="polite">
      {finished ? (
        <>
          <AppIcon name="task_alt" className="text-4xl text-success" />
          <h2 className="text-title-lg font-bold text-on-surface">סיימתם את הסבב</h2>
          {summary ? <p className="text-body-md text-on-surface-variant">{summary}</p> : null}
          <p className="text-body-md text-on-surface-variant">הסימונים ממתינים לאישור המנהל.</p>
        </>
      ) : (
        <p className="text-body-md text-on-surface-variant">
          אחרי שתעברו על כל {total} השורות (גם "דלג" נחשב) — תוכלו לקחת {total} נוספות. אם תצאו מהדף לפני כן, מה שסימנתם
          נשמר, והשורות שלא סימנתם יעברו למתנדב אחר.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon="add" onClick={onMore} disabled={!finished} loading={loading}>
          קח 30 שורות נוספות
        </Button>
        {finished ? (
          <Button variant="outlined" onClick={onStop}>
            סיום להיום
          </Button>
        ) : null}
      </div>
    </section>
  )
}
