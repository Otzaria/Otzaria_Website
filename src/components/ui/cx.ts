export type ClassValue = string | false | null | undefined | 0

/**
 * מחבר מחלקות CSS ומדלג על ערכים ריקים (false / null / undefined / '').
 * זה *לא* tailwind-merge: מחלקות סותרות (p-4 מול p-6) לא "נפתרות" — שתיהן נשארות, והסדר
 * ב-CSS של Tailwind קובע. לכן הרכיבים ב-ui/ לא מקבלים margin חיצוני ולא מכפילים מאפיין
 * שהצרכן אמור לשנות; className של הצרכן מיועד לפריסה (רוחב, מיקום, gap) ולמשתנים של variant
 * (tall:..., md:...), לא לדריסת הצבע או הרדיוס של הרכיב.
 */
export function cx(...values: ClassValue[]): string {
  let out = ''
  for (const value of values) {
    if (!value) continue
    const trimmed = value.trim()
    if (!trimmed) continue
    out = out ? `${out} ${trimmed}` : trimmed
  }
  return out
}
