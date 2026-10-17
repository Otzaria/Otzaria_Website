import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'

/** "מפתחים?" — הפניה לתיעוד הארכיטקטורה בוויקי (קישור חיצוני, כפתור טונלי אחד). */
export default function DocsDevelopersCard({ href, className }: { href: string; className?: string }) {
  return (
    <Card padding="md" className={`flex flex-col gap-4 sm:flex-row sm:items-center ${className ?? ''}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconTile icon="terminal" size="md" />
        <div className="min-w-0">
          <p className="text-title-md text-on-surface">מפתחים?</p>
          <p className="text-body-sm text-on-surface-variant">תיעוד הארכיטקטורה המלא נמצא בוויקי הפרויקט ב-GitHub</p>
        </div>
      </div>
      <Button href={href} external variant="tonal" icon="open_in_new" className="self-start sm:self-auto">
        לתיעוד המפתחים
      </Button>
    </Card>
  )
}
