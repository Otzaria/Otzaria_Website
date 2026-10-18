import { FOCUS_RING } from '@/components/ui/focusRing'
import { cx } from '@/components/ui/cx'

/**
 * הטיפוגרפיה של גוף המדריך — מקור אחד לכל אלמנט שמגיע מהוויקי (wiki/WikiMarkdown) ולתוכן הקבוע
 * של מדריכי דיקטה והפיתוח, כדי ששלושתם ייראו אותו דבר. רק תפקידי צבע (on-surface, primary,
 * outline-variant, surface-container-*) ורדיוס הצורה (rounded-card).
 *
 * כותרת h2 — גופן התצוגה (OT Vilna, משקל 400 מהטוקן); h3/h4 — Assistant מודגש, כמו כותרות הכרטיסים באתר.
 * scroll-mt-24 — הקפיצה מתוכן העניינים נעצרת מתחת לכותרת העליונה הדביקה.
 */
export const PROSE = {
  h2: 'mt-12 mb-4 scroll-mt-24 border-t border-outline-variant pt-8 font-display text-headline-sm text-on-surface text-balance first:mt-0 first:border-t-0 first:pt-0 md:text-headline-md',
  h3: 'mt-8 mb-3 scroll-mt-24 text-title-lg text-on-surface',
  h4: 'mt-6 mb-2 text-title-md text-on-surface',
  p: 'mb-4 break-words text-body-md text-on-surface md:text-body-lg',
  ul: 'list-disc space-y-2 ps-6 marker:text-primary [li>&]:mt-2 [li>&]:mb-0',
  ol: 'list-decimal space-y-2 ps-6 marker:font-bold marker:text-primary [li>&]:mt-2 [li>&]:mb-0',
  li: 'break-words ps-1 text-body-md text-on-surface md:text-body-lg',
  link: cx(
    'rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary',
    FOCUS_RING
  ),
  strong: 'font-bold text-on-surface',
  blockquote: 'my-6 rounded-e-card rounded-s-none border-s-4 border-primary bg-surface-container-low px-4 py-3 text-on-surface [&>p:last-child]:mb-0',
  hr: 'my-10 border-outline-variant',
  /** קוד בתוך שורה. בתוך pre הרקע והריפוד מתאפסים (ראו pre). */
  code: 'rounded-sm bg-surface-container-high px-1.5 py-0.5 font-code text-on-surface break-words',
  /** בלוק קוד: LTR, גלילה פנימית — לעולם לא מרחיב את העמוד. בלי margin: בוויקי — my-6 ב-WikiMarkdown */
  pre: 'scrollbar-thin max-w-full overflow-x-auto rounded-card bg-surface-container-high p-4 text-start font-code text-body-sm leading-relaxed text-on-surface [&>code]:bg-transparent [&>code]:p-0 [&>code]:font-code',
  /** עטיפת טבלה: גלילה פנימית ברוחב צר */
  tableWrap: 'scrollbar-thin my-6 max-w-full overflow-x-auto rounded-card border border-outline-variant',
  table: 'w-full border-collapse text-start text-body-sm md:text-body-md',
  thead: 'bg-surface-container',
  th: 'border-b border-outline-variant px-4 py-3 text-start align-bottom font-bold text-on-surface',
  td: 'border-b border-outline-subtle px-4 py-3 align-top text-on-surface [tr:last-child>&]:border-b-0',
  figure: 'my-6',
  img: 'mx-auto block h-auto max-w-full rounded-card'
} as const

/** אזור גלילה פנימי (טבלה / בלוק קוד): מקבל פוקוס מהמקלדת (tabIndex=0) — טבעת הפוקוס האחידה */
export const SCROLL_REGION = FOCUS_RING
