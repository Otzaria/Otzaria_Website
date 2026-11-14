import type { ReactNode } from 'react'
import Section from '@/components/ui/Section'
import { cx } from '@/components/ui/cx'
import { DocsScrollSpyProvider } from './DocsScrollSpyProvider'
import DocsSidebar from './DocsSidebar'
import DocsToc from './DocsToc'
import type { TocItem } from './docsNav'

/**
 * מעטפת דף מדריך (בתוך <main>). במסך רחב (מ-lg) — שתי עמודות, ממורכזות כגוש אחד:
 *   [סרגל ימני דביק] [פירורי לחם, כותרת, עמודת הקריאה]
 * הסרגל הימני מחזיק את כל הניווט: ניווט המדריך, ובתוכו — מתחת לדף הנוכחי — "בעמוד זה" עם
 * scroll-spy. בלי ניווט מדריך (פיתוח) — "בעמוד זה" לבד באותו מקום. אין עמודה שמאלית:
 * הקורא העברי מתחיל מימין ומתמקד במרכז ובימין, ותוכן עניינים בשוליים השמאליים פשוט לא נראה
 * (כמו ויקיפדיה העברית, שהעבירה את תוכן העניינים לסרגל בצד ההתחלה).
 * מתחת ל-lg: ניווט המדריך ו"בעמוד זה" — מקפלים סגורים מעל התוכן.
 *
 * nav (אופציונלי) — panel(toc): הניווט בצד, שמקבל את "בעמוד זה" לשילוב מתחת לדף הנוכחי
 *   (null כשאין תוכן עניינים); folded — המקפל בנייד.
 * עמודת הקריאה: minmax(0,48rem) — שורה נוחה לקריאה; טבלה או בלוק קוד רחבים נגללים בפנים.
 * [data-docs-end] — סוף המאמר, עבור ה-scroll-spy (סעיפים קצרים בסוף הדף).
 */
export default function DocsLayout({ titleId, breadcrumbs, hero, nav, toc, children, after }: {
  titleId: string
  breadcrumbs: ReactNode
  hero: ReactNode
  nav?: { panel: (toc: ReactNode) => ReactNode; folded: ReactNode }
  toc?: { title: string; items: TocItem[] }
  children: ReactNode
  after?: ReactNode
}) {
  const hasToc = Boolean(toc && toc.items.length > 0)
  const hasSidebar = Boolean(nav) || hasToc

  const sideToc = hasToc && toc ? <DocsToc title={toc.title} items={toc.items} variant="panel" /> : null

  const body = (
    <Section labelledBy={titleId} spacing="none" className="pt-2 pb-14 md:pt-4 md:pb-20">
      <div
        className={cx(
          'grid gap-8 xl:gap-10',
          hasSidebar ? 'lg:grid-cols-[15rem_minmax(0,48rem)] lg:justify-center' : 'mx-auto w-full max-w-narrow'
        )}
      >
        {hasSidebar && (
          <aside className="hidden lg:block">
            <DocsSidebar className="mt-2 md:mt-4">{nav ? nav.panel(sideToc) : sideToc}</DocsSidebar>
          </aside>
        )}

        <div className="min-w-0">
          {breadcrumbs}
          {/* הרווח שמתחת לכותרת — של PageHeader (mb-8 / md:mb-10), כמו בשאר הדפים; לא מוסיפים עליו */}
          <div className="mt-4 md:mt-6">{hero}</div>
          {hasSidebar && (
            <div className="mb-6 space-y-3 lg:hidden">
              {nav?.folded}
              {hasToc && toc && <DocsToc title={toc.title} items={toc.items} variant="folded" />}
            </div>
          )}
          {children}
          <div data-docs-end="" aria-hidden="true" />
          {after}
        </div>
      </div>
    </Section>
  )

  // spy אחד לשתי תצוגות ה-TOC (סרגל ומקפל)
  return hasToc && toc ? <DocsScrollSpyProvider items={toc.items}>{body}</DocsScrollSpyProvider> : body
}
