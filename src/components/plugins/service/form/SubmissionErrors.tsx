import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'

/** רשימת שגיאות (בדיקה מקדימה או תשובת השרת) — טקסט בלבד */
export default function SubmissionErrors({ errors, title = 'לא ניתן לשלוח את ההגשה', className }: {
  errors: string[]
  title?: string
  className?: string
}) {
  if (errors.length === 0) return null
  return (
    <div role="alert" className={cx('rounded-(--card-radius) bg-error-container p-4 text-on-error-container', className)}>
      <p className="flex items-center gap-2 text-title-sm">
        <AppIcon name="error" className="text-[1.25rem]" />
        {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 ps-6 text-body-sm">
        {errors.map((error, i) => <li key={i}>{error}</li>)}
      </ul>
    </div>
  )
}
