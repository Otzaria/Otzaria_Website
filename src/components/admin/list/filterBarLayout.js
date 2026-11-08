// הפריסה של סרגל הסינון המשותף (list/FilterBar) — משותפת לסרגל ולשלד שלו (FilterBarSkeleton). קובץ רגיל (לא
// 'use client'), כדי שגם שלד שהוא רכיב שרת יקבל את המחרוזות עצמן. מחרוזות מלאות בלבד (Tailwind סורק את הקוד).
import { cx } from '@/components/ui/cx'

/** נקודת השבירה של הסרגל: מתחתיה הבוררים מקופלים מאחורי "סינון (2)"; ממנה — בשורה אחת, גלויים תמיד */
const AT_2XL = {
  compact: '@2xl:hidden',
  panel: '@2xl:grid @2xl:items-end',
  clearHidden: '@2xl:invisible @max-2xl:hidden',
}
// בעמודים ארבעה בוררים, שניים ברוחב קבוע — השורה האחת נפתחת רק ברוחב גדול יותר
const AT_3XL = {
  compact: '@3xl:hidden',
  panel: '@3xl:grid @3xl:items-end',
  clearHidden: '@3xl:invisible @max-3xl:hidden',
}

/**
 * העמודות של הבוררים בשורה הרחבה, ובסוף — עמודה ל"נקה סינון" (שומרת את מקומה גם כשאין סינון).
 * fill — הבוררים מתחלקים ברוחב; fixed — עד 16rem כל אחד (מעט בוררים, ערכים קצרים).
 */
export const FILTER_LAYOUTS = {
  fill2: { ...AT_2XL, columns: '@2xl:grid-cols-[repeat(2,minmax(0,1fr))_auto]' },
  fill3: { ...AT_2XL, columns: '@2xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]' },
  fill4: { ...AT_2XL, columns: '@2xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]' },
  fixed1: { ...AT_2XL, columns: '@2xl:grid-cols-[minmax(0,16rem)_auto]' },
  fixed2: { ...AT_2XL, columns: '@2xl:grid-cols-[repeat(2,minmax(0,16rem))_auto]' },
  pages: { ...AT_3XL, columns: '@3xl:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,11rem)_auto]' },
}

/** @param {keyof typeof FILTER_LAYOUTS} name */
export function filterLayout(name) {
  const layout = FILTER_LAYOUTS[name]
  if (!layout) throw new Error(`filterLayout: אין פריסה בשם "${name}"`)
  return layout
}

/**
 * לוח הבוררים: בטלפון עמודה אחת (שתיים ברוחב בינוני), גלוי רק כשנפתח; מנקודת השבירה — שורה אחת תמיד.
 * @param {keyof typeof FILTER_LAYOUTS} name
 * @param {boolean} open
 */
export function filterPanelClass(name, open) {
  const layout = filterLayout(name)
  return cx('grid-cols-1 gap-3 @md:grid-cols-2', layout.panel, layout.columns, open ? 'grid' : 'hidden')
}
