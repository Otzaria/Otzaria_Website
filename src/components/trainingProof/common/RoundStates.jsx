import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import NoAccess from './NoAccess'

// המצבים של מסך-סבב שאינם "עובדים": טוען / אין גישה / אין שורות / שגיאה. מחזיר null כשמוכן.
export default function RoundStates({ round, onHome }) {
  if (round.status === 'loading')
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  if (round.status === 'noaccess') return <NoAccess access={round.access} onRequested={round.reload} />
  if (round.status === 'empty')
    return (
      <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 text-center">
        <AppIcon name="task_alt" className="text-5xl text-on-surface-variant" />
        <h2 className="text-title-lg font-bold text-on-surface">אין כרגע שורות להגהה בחלק הזה</h2>
        <p className="text-body-md text-on-surface-variant">חומר חדש עולה מתחנת-האימון מדי פעם. נסו שוב מאוחר יותר.</p>
        <Button variant="outlined" icon="arrow_forward" onClick={onHome}>
          לדף הבית
        </Button>
      </div>
    )
  if (round.status === 'error')
    return (
      <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 text-center" role="alert">
        <AppIcon name="error" className="text-5xl text-error" />
        <p className="text-body-md text-on-surface">{round.error}</p>
        <Button onClick={round.reload}>נסו שוב</Button>
      </div>
    )
  return null
}

// הודעה כשהשורות עברו למתנדב אחר (הדופק פסק — המחשב נרדם, החיבור נפל)
export function LostNotice({ onRetake }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-container px-4 py-3 text-on-warning-container" role="alert">
      <AppIcon name="info" />
      <span className="flex-1">
        עבר זמן רב בלי חיבור, והשורות שלא סימנתם עברו למתנדב אחר. מה שסימנתם — נשמר.
      </span>
      <Button size="sm" onClick={onRetake}>
        קח סבב חדש
      </Button>
    </div>
  )
}
