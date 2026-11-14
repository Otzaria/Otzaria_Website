// הפריסה של "ממתין לטיפולך" — משותפת לכרטיסים, לכרטיס שלא נטען ולשלד הטעינה, כדי שכולם יהיו
// באותן מידות ושלא תהיה קפיצה כשהשלד מתחלף.
//
// רשת: לפי רוחב האזור עצמו (container query), לא לפי רוחב המסך — כי ליד הסרגל במחשב האזור צר
// מהמסך. עמודה אחת עד 48rem, 2 מ-48rem, 3 מ-72rem — כך כל כרטיס רחב מספיק לשורה קומפקטית
// (אריח | שם ותווית | מספר) בלי שהתווית תישבר. ליד הסרגל במחשב (1280–1440) זה 2 עמודות, ובמסך
// רחב יותר 3. השורות "מאוזנות": 13 כרטיסים ב-3 עמודות יוצאים
// 3+3+3+2+2 (רשת של 6 יחידות, וכרטיס בשורה של 2 תופס 3 יחידות) — בלי חורים בסוף ובלי כרטיס בודד צר.
// היחידות ב-rem: בטקסט מוגדל יש פחות עמודות, והכרטיסים לא נמחצים.

export const QUEUE_LIST = 'grid grid-cols-1 gap-3 @3xl:grid-cols-2 @6xl:grid-cols-6 md:gap-4'

// מחרוזות מלאות (לא מורכבות) — כדי ש-Tailwind ימצא אותן בסריקה
const SPAN_IN_TWO = { 1: '@3xl:col-span-1', 2: '@3xl:col-span-2' }
const SPAN_IN_SIX = { 1: '@6xl:col-span-6', 2: '@6xl:col-span-3', 3: '@6xl:col-span-2' }

/**
 * גודל כל שורה כשמחלקים n כרטיסים לשורות של עד cols, כמה שיותר שוות (הגדולות קודם).
 * 13/3 → [3,3,3,2,2]; 4/3 → [2,2]; 5/2 → [2,2,1].
 */
export function balancedRows(n, cols) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(cols) || cols <= 0) return []
  const rows = Math.ceil(n / cols)
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** כמה כרטיסים יש בשורה של הכרטיס ה-index (מתוך n), כשיש cols עמודות */
function rowSizeAt(index, n, cols) {
  let start = 0
  for (const size of balancedRows(n, cols)) {
    if (index < start + size) return size
    start += size
  }
  return 1
}

/** המחלקות של הכרטיס ה-index מתוך n: כמה עמודות הוא תופס ב-2 וב-3 עמודות */
export function queueSpanClasses(index, n) {
  return `${SPAN_IN_TWO[rowSizeAt(index, n, 2) === 1 ? 2 : 1]} ${SPAN_IN_SIX[rowSizeAt(index, n, 3)]}`
}

// בתוך הכרטיס (container query על הכרטיס עצמו): שורה קומפקטית — אריח | שם, מה נספר ושורת משנה |
// המספר בקצה. כשהתוכן של הכרטיס צר מ-18rem (טלפון קטן, או טקסט מוגדל) המספר עובר לשורה משלו מתחת
// לשם, כדי שלא ייכתב על הטקסט ולא ימחץ אותו. מספר ארוך (100,000 ומעלה) עובר כבר מתחת ל-24rem.
const STACKED = [
  'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3',
  "[grid-template-areas:'icon_title'_'icon_count'_'icon_label'_'icon_note']",
]
export const QUEUE_CARD_INNER = [
  ...STACKED,
  '@min-[18rem]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[18rem]:gap-x-4',
  "@min-[18rem]:[grid-template-areas:'icon_title_count'_'icon_label_count'_'icon_note_count']",
].join(' ')
export const QUEUE_CARD_INNER_LONG = [
  ...STACKED,
  '@min-[24rem]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[24rem]:gap-x-4',
  "@min-[24rem]:[grid-template-areas:'icon_title_count'_'icon_label_count'_'icon_note_count']",
].join(' ')
/** מיקום המספר בשורה (רק כשהוא בקצה) — לפי אותו סף */
export const QUEUE_COUNT_SIDE = '@min-[18rem]:self-center @min-[18rem]:text-end'
export const QUEUE_COUNT_SIDE_LONG = '@min-[24rem]:self-center @min-[24rem]:text-end'
/** מספר ארוך — מ-7 תווים ("100,000") */
export const isLongCount = (countText) => String(countText).length >= 7

/**
 * שורת המשנה תופסת תמיד אותו גובה — גם ריקה, וגם כשהיא תג (ותק חריג) — כדי שכל הכרטיסים והשלד
 * יהיו באותו גובה ושורה עם תג לא תהיה גבוהה מהשכנה שלה.
 */
export const QUEUE_NOTE_ROW = '[grid-area:note] flex min-h-(--badge-height-sm) items-center text-body-sm'

/** רשימת "כבר מטופל" — באותן עמודות כמו הכרטיסים */
export const CLEAR_LIST = 'grid grid-cols-1 gap-x-3 @3xl:grid-cols-2 @6xl:grid-cols-3 md:gap-x-4'

export const QUEUE_CARD_FRAME = '@container block h-full border border-transparent p-4 sm:px-5'
