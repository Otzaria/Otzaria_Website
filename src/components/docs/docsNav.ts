/** פריט בניווט המדריך למשתמש (lib/wiki → getUserGuideNav): הסדר הוא סדר _Sidebar.md של הוויקי */
export type GuideNavItem = { slug: string; title: string; page?: string }

/**
 * הדף הקודם והבא בסדר המדריך. דף שאינו בסרגל (נטען בגזירה ישירה מהוויקי) — בלי קודם ובלי הבא,
 * כי אין לו מקום מוגדר ברצף.
 */
export function getAdjacentGuides<T extends GuideNavItem>(nav: readonly T[], slug: string): { prev: T | null; next: T | null } {
  const index = nav.findIndex((item) => item.slug === slug)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? nav[index - 1] : null,
    next: index < nav.length - 1 ? nav[index + 1] : null
  }
}

/** פריט תוכן עניינים: עוגן בדף ותווית */
export type TocItem = { href: string; label: string }

/** ה-TOC של דף ויקי ({text, id}) → פריטי תוכן עניינים */
export function wikiTocItems(toc: readonly { text: string; id: string }[]): TocItem[] {
  return toc.map((h) => ({ href: `#${h.id}`, label: h.text }))
}
