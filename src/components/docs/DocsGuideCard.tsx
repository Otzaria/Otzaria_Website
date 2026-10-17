import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'

/**
 * כרטיס מדריך בדף הבית של המדריכים — בשפת כרטיסי היכולות של דף הבית: אריח אייקון וכותרת
 * באותה שורה, ותיאור (אם יש) מתחת. כל הכרטיס קישור אחד (ui/Card href).
 * titleAs — 'h3' כשהכרטיס תחת כותרת אזור; 'span' ברשימה בלי כותרת אזור (הרשימה עצמה היא המבנה).
 */
export default function DocsGuideCard({ href, icon, title, description, titleAs: Title = 'span' }: {
  href: string
  icon: string
  title: string
  description?: string
  titleAs?: 'h3' | 'span'
}) {
  return (
    <Card href={href} padding="md" className="flex h-full flex-col gap-2">
      <span className="flex items-center gap-3">
        <IconTile icon={icon} size="md" />
        <Title className="block min-w-0 text-title-md text-on-surface">{title}</Title>
      </span>
      {description && <span className="block text-body-sm text-on-surface-variant">{description}</span>}
    </Card>
  )
}
