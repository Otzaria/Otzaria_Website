'use client'

import { usePathname } from 'next/navigation'
import { isPageEditorPath } from '@/lib/editorRoute'

/**
 * המעטפת של דפי /library: תוכן + פוטר. בעורך העמוד — בלי פוטר ובלי עוטף min-h-screen: העורך
 * ממלא את החלון (h-dvh) בעצמו, והדף לא נגלל. data-editor-route מכבה את גלילת הדף ואת מקום
 * פס הגלילה הקבוע (scrollbar-gutter) — ראו base.css.
 *
 * footer מגיע מה-layout (רכיב שרת) כ-prop, כדי שהפוטר עצמו יישאר רכיב שרת.
 */
export default function LibraryChrome({ children, footer }) {
  const pathname = usePathname()
  if (isPageEditorPath(pathname)) {
    return <div data-editor-route="" className="h-dvh overflow-hidden">{children}</div>
  }
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1">
        {children}
      </div>

      {footer}
    </div>
  )
}
