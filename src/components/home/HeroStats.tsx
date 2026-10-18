import type { CSSProperties } from 'react'
import { formatExactNumber, formatStatParts } from '@/lib/homeStats/homeStats'
import { narrowColumns, startsNarrowRow } from './heroStatsLayout'

// שורת המספרים שבמסך הפתיחה ("אוצריא במספרים") — תצוגה בלבד; השליפה ב-HeroStatsLoader.
//
// כרטיס רך אחד (לא כרטיס לכל נתון): משטח בהיר, מסגרת דקה וצל עדין שמבדילים את השורה
// מהגיבור שמעליה; בתוכו מספר גדול, תווית קטנה מתחתיו, וקווי הפרדה דקים בין הפריטים.
// (נבחר מול קו הפרדה למעלה/למטה, קישוט זהב ופס טונלי — ראו CARD_CLASS.)
// רוחב: הכרטיס הוא שורה שנייה ברשת של הגיבור, על פני שתי העמודות (HeroSection) — הקצה האחד
// שלו הוא הקצה החיצוני של הספר, והשני הקצה החיצוני של עמודת הטקסט (הפרש 0), כך שהוא נמצא מתחת
// לכל הגיבור. תמיד ברוחב הגיבור, גם כשמקור נכשל ויש פחות פריטים — היישור לגיבור גובר על
// "פחות נתונים, כרטיס צר יותר". (קודם: רוחב קבוע משלו, max-w-4xl ממורכז על הדף.)
// מספר הפריטים משתנה (עד ארבעה נתונים ועוד הגרסה; מקור שנכשל מוסתר), ולכן כולם תמיד בשורה
// אחת ברוחב שווה. גודל המספר נגזר מרוחב הפריט (cqi של ה-@container), כך שגם ארבעה פריטים
// ב-360px נכנסים.
// מספר גדול מקוצר ("5.8 מיליון", ראו formatStatParts); לקוראי מסך — המספר המדויק.
//
// במסך צר (narrow, מתחת ל-400px) — מארבעה פריטים שתי שורות מאוזנות (5 → 3+2, השורה התחתונה
// ממורכזת), כל פריט ברוחב 1/--stat-cols, ובלי קו הפרדה בראש כל שורה (heroStatsLayout.ts).
//
// במסך גבוה (tall) — כל המידות של 2xl כפול --hero-tall-rem, כמו שאר הגיבור (HeroSection).
//
// הגרסה האחרונה (version) — פריט אחרון בשורה, זהה לשאר בצבע, במשקל ובמבנה (ערך גדול,
// "גרסה" מתחת), כך שהיא משתלבת בשורה ולא בולטת ממנה. בסוף השורה — כדי לא לקטוע את רצף
// הנתונים הכמותיים. בלי גרסה (GitHub לא זמין) — הפריט פשוט לא מוצג, כמו כל נתון שנכשל.

export type StatItem = {
  key: string
  label: string
  value: number
}

/** הגובה שהשורה תופסת — משותף לשורה עצמה ולשומר המקום שלה, כדי שלא תהיה קפיצת layout.
 *  במסך צר — שתי שורות (המקרה הרגיל: ארבעה נתונים וגרסה), כל אחת נמוכה יותר (התוויות
 *  בשורה אחת ברוחב שליש), ועוד הרווח ביניהן. */
export const HERO_STATS_MIN_HEIGHT =
  'min-h-[4.25rem] narrow:min-h-[calc(2.75rem*2+var(--stats-row-gap))] sm:min-h-[4.75rem] 2xl:min-h-[5.5rem] tall:min-h-[calc(5.5*var(--hero-tall-rem))]'

/** ריפוד הכרטיס — משותף לשורה ולשומר המקום, כדי ששניהם יהיו באותו גובה. box-content: ה-min-h
 *  (HERO_STATS_MIN_HEIGHT) הוא גובה התוכן, והריפוד נוסף עליו. אנכי בלבד — לפריטים יש ריפוד
 *  צד משלהם, וריפוד צד עם box-content היה מרחיב את w-full מעבר למכל. */
const CARD_PADDING = 'box-content py-5 2xl:py-6 tall:py-[calc(1.5*var(--hero-tall-rem))]'

/** הכרטיס עצמו: משטח (surface) על רקע הדף, מסגרת outline-variant דקה וצל md רך. המסגרת
 *  inset-ring — בתוך הקופסה ולא פיקסל מחוצה לה, כך שהקצה הנראה של הכרטיס הוא בדיוק הקצה
 *  שמיושר לגיבור (HeroSection). השורה
 *  ממורכזת בו אנכית (flex-wrap + content-center; הפריטים עצמם items-start, כך שהמספרים
 *  תמיד על קו אחד) — ה-min-h שומר מקום גם לשורה גבוהה מהתוכן בפועל. ברוחב רגיל אין שבירה:
 *  לפריטים flex-1 ו-min-w-0, והם מתכווצים לפני שהם נשברים. */
const CARD_CLASS = `rounded-2xl bg-surface shadow-md inset-ring inset-ring-outline-variant/60 ${CARD_PADDING}`

/** הרווח בין שתי השורות במסך צר. */
const ROW_GAP = '[--stats-row-gap:--spacing(5)]'

const ITEM_CLASS =
  '@container flex min-w-0 flex-1 flex-col-reverse items-center justify-end gap-1 border-s border-outline-variant px-2 text-center first:border-s-0 narrow:flex-none narrow:basis-[calc(100%/var(--stat-cols))] sm:px-4'
/** פריט שפותח שורה במסך צר — בלי קו הפרדה */
const ROW_START_CLASS = 'narrow:border-s-0'
const LABEL_CLASS = 'text-balance text-xs leading-snug text-on-surface-variant sm:text-sm lg:text-base 2xl:text-lg tall:text-[calc(1.125*var(--hero-tall-rem))]'
const VALUE_CLASS =
  'whitespace-nowrap font-bold leading-none tabular-nums text-on-surface text-[clamp(1.25rem,18cqi,2.375rem)] 2xl:text-[clamp(1.25rem,18cqi,2.875rem)] tall:text-[clamp(1.25rem,18cqi,calc(2.875*var(--hero-tall-rem)))]'

export default function HeroStats({ items, version = null, className = '' }: {
  items: StatItem[]
  version?: string | null
  className?: string
}) {
  const count = items.length + (version ? 1 : 0)
  if (count === 0) return null
  const itemClass = (index: number) => `${ITEM_CLASS} ${startsNarrowRow(index, count) ? ROW_START_CLASS : ''}`

  return (
    <dl
      aria-label="אוצריא במספרים"
      style={{ '--stat-cols': narrowColumns(count) } as CSSProperties}
      className={`animate-enter-fade flex w-full flex-wrap content-center items-start ${ROW_GAP} narrow:justify-center narrow:gap-y-(--stats-row-gap) ${HERO_STATS_MIN_HEIGHT} ${CARD_CLASS} ${className}`}
    >
      {items.map((item, index) => {
        const parts = formatStatParts(item.value)
        return (
          <div key={item.key} className={itemClass(index)}>
            <dt className={LABEL_CLASS}>{item.label}</dt>
            <dd className={VALUE_CLASS}>
              <span aria-hidden="true" data-testid="hero-stat-value">
                {parts.number}
                {parts.unit && <span className="ms-1 text-[0.55em] font-semibold">{parts.unit}</span>}
              </span>
              <span className="sr-only">{formatExactNumber(item.value)}</span>
            </dd>
          </div>
        )
      })}
      {version && (
        <div className={itemClass(items.length)}>
          <dt className={LABEL_CLASS}>גרסה</dt>
          <dd className={VALUE_CLASS} data-testid="hero-stat-version">
            <bdi dir="ltr">{version}</bdi>
          </dd>
        </div>
      )}
    </dl>
  )
}

/** שומר מקום בזמן שהנתונים נטענים (Suspense) — באותו גובה, בלי תוכן. */
export function HeroStatsPlaceholder({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`w-full ${ROW_GAP} ${HERO_STATS_MIN_HEIGHT} ${CARD_PADDING} ${className}`} />
}
