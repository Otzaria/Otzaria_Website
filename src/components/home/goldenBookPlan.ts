// הספר המוזהב בגיבור (GoldenBook) — ההחלטה אם לנגן את פתיחת הספר, ועד מתי מחכים לרצועה,
// כלוגיקה טהורה.
//
import { SPRITE_AVIF_SRC, SPRITE_WEBP_SRC } from './goldenBookAssets'

export type BookOpening = 'animate' | 'static'

/** הזמן שמוקצה לפענוח התמונה הראשונה והרצועה אחרי hydration. */
export const OPEN_WAIT_MS = 1000

export function planBookOpening({
  reducedMotion = false, saveData = false, slowConnection = false, hydrated = true
}: { reducedMotion?: boolean; saveData?: boolean; slowConnection?: boolean; hydrated?: boolean } = {}): BookOpening {
  return reducedMotion || saveData || slowConnection || !hydrated ? 'static' : 'animate'
}

/** המועד (בשעון performance.now) שאחריו כבר לא מתחילים לנגן: OPEN_WAIT_MS מרגע ה-hydration */
export function openingDeadline(hydratedAt: number, waitMs = OPEN_WAIT_MS): number {
  return hydratedAt + waitMs
}

// תמונת AVIF בגודל 2×2 — בדיקת יכולת פענוח (decode) אמיתית, לא ניחוש לפי user-agent
const AVIF_PROBE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='

let spriteSrcPromise: Promise<string> | undefined

/** לטסטים: מאפס את תוצאת הבחירה השמורה */
export function resetSpriteSrcCache() {
  spriteSrcPromise = undefined
}

/**
 * איזו רצועה לטעון ולפענח: AVIF אם הדפדפן מפענח אותו, אחרת WebP.
 *
 * אותה כתובת משמשת לפענוח ולתצוגת הרצועה. בדיקת הפורמט פועלת על תמונה
 * זעירה שנמצאת בקוד, לפני שמורידים את הרצועה.
 */
export function chooseSpriteSrc(): Promise<string> {
  spriteSrcPromise ??= (async () => {
    try {
      const probe = new Image()
      probe.src = AVIF_PROBE
      await probe.decode()
      return SPRITE_AVIF_SRC
    } catch {
      return SPRITE_WEBP_SRC
    }
  })()
  return spriteSrcPromise
}

/** דפדפן בלי נתוני חיבור יכול לנסות לנגן במסגרת חלון הזמן הרגיל. */
export function readBookConnection(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator) {
  const connection = (nav as { connection?: {
    saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number
  } } | undefined)?.connection
  return {
    saveData: connection?.saveData === true,
    slowConnection: Boolean(
      (connection?.effectiveType && connection.effectiveType !== '4g') ||
      (connection?.downlink != null && connection.downlink < 1.5) ||
      (connection?.rtt != null && connection.rtt >= 450)
    ),
  }
}
