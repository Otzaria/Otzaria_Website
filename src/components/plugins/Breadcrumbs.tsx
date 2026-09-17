import { Fragment } from 'react'
import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  // כשאין href — הפריט מוצג כעמוד הנוכחי (מודגש, ללא קישור)
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  // מחלקות ה-nav עצמו (הריווח/עטיפת שורות שונים מעט בין דפי החנות)
  className: string
}

// "פירורי לחם" משותף לדפי חנות התוספים — רשימת פריטים מופרדת ב-'‹', כאשר
// לפריט האחרון (וכל פריט ללא href) אין קישור.
export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={className} aria-label="פירורי לחם">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true">‹</span>}
          {item.href ? (
            <Link href={item.href} className="text-primary hover:underline font-medium">
              {item.label}
            </Link>
          ) : (
            <span className="font-bold text-on-surface">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}
