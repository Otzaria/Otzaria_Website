import DocsDisclosure from './DocsDisclosure'
import DocsTocLinks from './DocsTocLinks'
import type { TocItem } from './docsNav'

/**
 * תוכן העניינים של דף מדריך ("בעמוד זה" / "תוכן עניינים" — התווית של כל דף נשמרת), עם scroll-spy
 * (DocsTocLinks). תמיד בצד ימין — צד תחילת הקריאה — ולא בשוליים השמאליים, שהעין לא מגיעה אליהם.
 * variant:
 *   panel  — במסך רחב: רשימה בסרגל הימני הדביק — בתוך ניווט המדריך (DocsGuideNav), מתחת לדף
 *            הנוכחי, או לבד כשאין ניווט מדריך (פיתוח).
 *   folded — בנייד/טבלט: מקפל סגור מעל התוכן (DocsDisclosure).
 * ב-panel הרשימה יושבת ישירות על רקע הדף, בלי קופסה ובלי כותרת גלויה — התווית רק ב-aria-label.
 * הדף מרנדר רשימה צדדית ומקפל, ומסתיר כל אחד ברוחב שאינו שלו (hidden lg:block / lg:hidden).
 */
export default function DocsToc({ title, items, variant, className }: {
  title: string
  items: TocItem[]
  variant: 'panel' | 'folded'
  className?: string
}) {
  if (items.length === 0) return null
  if (variant === 'folded') {
    return (
      <nav aria-label={title} className={className}>
        <DocsDisclosure label={title} icon="toc">
          <DocsTocLinks items={items} compact={false} />
        </DocsDisclosure>
      </nav>
    )
  }
  return (
    <nav aria-label={title} className={className}>
      <DocsTocLinks items={items} compact />
    </nav>
  )
}
