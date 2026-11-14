import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'

/**
 * הפעולות המשניות בראש עמוד התוסף — שורה שקטה מתחת לכפתורי ההורדה/ההתקנה:
 *   "מקור" (אתר התוסף, בלשונית חדשה) — לכל צופה, כשיש homepage.
 *   "דיווח למפתח" — לכל צופה, גלוי בלי גלילה (המשתמשים לא גוללים עד סוף העמוד כדי למצוא איך מדווחים).
 *     כפתור טקסט קטן — לא מתחרה בהורדה/ההתקנה. החלון — PluginReportModal בעמוד.
 *   "ערוך" ו"השהה מהחנות"/"החזר לחנות" — למעלה התוסף בלבד (ההחלטה — ownerPermissions).
 *   "הגשות השירות" (serviceUrl) — במקום "ערוך" בתוסף שירות, שהעריכה הישירה שלו חסומה.
 * הנוסח והכותרות (title) — כפי שהיו. הלוגיקה (fetch, אישור) נשארת בעמוד; כאן רק המראה.
 */
export default function PluginSecondaryActions({
  homepage,
  onReport,
  canEdit,
  loadingEdit,
  onEdit,
  showSuspendToggle,
  isSuspended,
  suspending,
  onToggleSuspend,
  serviceUrl,
  className
}: {
  homepage?: string
  onReport: () => void
  canEdit: boolean
  loadingEdit: boolean
  onEdit: () => void
  showSuspendToggle: boolean
  isSuspended: boolean
  suspending: boolean
  onToggleSuspend: () => void
  serviceUrl?: string | null
  className?: string
}) {
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {homepage && (
        <Button href={homepage} external variant="text" size="sm" icon="open_in_new">
          מקור
        </Button>
      )}
      <Button variant="text" size="sm" icon="flag" onClick={onReport} title="דיווח על תקלה או בעיה למפתח התוסף">
        דיווח למפתח
      </Button>
      {canEdit && (
        <Button variant="tonal" size="sm" icon="edit" onClick={onEdit} loading={loadingEdit}>
          {loadingEdit ? 'טוען...' : 'ערוך'}
        </Button>
      )}
      {serviceUrl && (
        <Button href={serviceUrl} variant="tonal" size="sm" icon="package_2">
          הגשות השירות
        </Button>
      )}
      {showSuspendToggle && (
        <Button
          variant="outlined"
          size="sm"
          icon={isSuspended ? 'play_circle' : 'pause_circle'}
          onClick={onToggleSuspend}
          loading={suspending}
          title={isSuspended ? 'החזרת התוסף לחנות' : 'השהיית התוסף — לא יופיע בחנות ולא יהיה ניתן להורדה'}
        >
          {suspending ? 'מעדכן...' : isSuspended ? 'החזר לחנות' : 'השהה מהחנות'}
        </Button>
      )}
    </div>
  )
}
