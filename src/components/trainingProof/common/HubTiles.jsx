import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import ScriptTag from './ScriptTag'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('he-IL') : '—')

function Tile({ icon, title, text, legend, nums, cta, href }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-2xl bg-(--card-bg) p-5">
      <div className="flex size-11 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
        <AppIcon name={icon} className="text-[26px]" />
      </div>
      <h2 className="text-title-lg font-bold text-on-surface">{title}</h2>
      <p className="text-body-sm text-on-surface-variant">{text}</p>
      <div className="flex flex-wrap items-center gap-1.5">{legend}</div>
      <div className="flex gap-4 tabular-nums">
        {nums.map(([n, label]) => (
          <div key={label}>
            <b className="block text-[22px] leading-tight text-primary">{n}</b>
            <span className="text-label-sm text-on-surface-variant">{label}</span>
          </div>
        ))}
      </div>
      <Button href={href} iconEnd="arrow_back" className="mt-auto self-start">
        {cta}
      </Button>
    </section>
  )
}

const chip = (t) => (
  <span key={t} className="rounded-md bg-surface-container-highest px-2 py-0.5 text-label-sm text-on-surface-variant">
    {t}
  </span>
)

// שלושת החלקים בדף הבית (docs/75 §2). בלי משפט-פתיחה (ה-2).
export default function HubTiles({ sections }) {
  const { ocr, router, frames } = sections
  const roundText = (r) => (r.open > 0 ? `${r.total - r.open}/${r.total}` : '—')
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Tile
        icon="text_fields"
        title="זיהוי טקסט"
        text="משווים את הטקסט שהמודל קרא לתמונת השורה, ומתקנים. 30 שורות בכל סבב, מעורבבות מכל הספרים והכתבים."
        legend={['rashi', 'square', 'latin', 'mixed'].map((s) => <ScriptTag key={s} script={s} />)}
        nums={[
          [fmt(ocr.pool), 'שורות ממתינות'],
          [roundText(ocr.round), 'בסבב שלך'],
        ]}
        cta={ocr.round.open > 0 ? 'המשך את הסבב' : 'התחל סבב של 30 שורות'}
        href="/library/page-proof/ocr"
      />
      <Tile
        icon="call_split"
        title="נתב הכתב"
        text="קובעים באיזה כתב כל שורה, ובשורה מעורבת — כתב לכל מילה. 30 שורות בכל סבב, עם קיצורי-מקשים."
        legend={['נתב-שורה', 'נתב-מילה', 'נתב-רצועה'].map(chip)}
        nums={[
          [fmt(router.pool), 'שורות ממתינות'],
          [roundText(router.round), 'בסבב שלך'],
        ]}
        cta={router.round.open > 0 ? 'המשך את הסבב' : 'התחל סבב של 30 שורות'}
        href="/library/page-proof/router"
      />
      <Tile
        icon="dashboard"
        title="גלאי אזורי-טקסט"
        text="מסמנים מסגרות סביב אזורי הטקסט בעמוד ואת סדר הקריאה. העבודה היא לפי ספר: לוקחים ספר שלם, ומי שלא סיים — אחר ממשיך ממנו."
        legend={['גוף', 'פירוש', 'הערות', 'ריהוט'].map(chip)}
        nums={[
          [fmt(frames.available), 'ספרים פנויים'],
          [fmt(frames.partial), 'להמשך מאחרים'],
        ]}
        cta={frames.mine > 0 ? 'המשך בספר שלך' : 'בחר ספר'}
        href="/library/page-proof/frames"
      />
    </div>
  )
}
