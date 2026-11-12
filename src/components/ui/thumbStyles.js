import { cx } from './cx'

/**
 * המראה של תמונה ממוזערת (ui/Thumb): המסגרת, ובתוכה התמונה או ממלא המקום (אייקון) — באותה מידה בדיוק.
 * cover — כריכה/עמוד (ספר): פינות כמעט ישרות, רקע נייטרלי וקו מתאר דק; התמונה מיושרת למעלה (ראש העמוד).
 * tile — אריח (תוסף): פינות של פקד, רקע משני; התמונה ממורכזת.
 */
export const THUMB_TONES = {
  cover: {
    frame: 'rounded-(--radius-xs) bg-surface-container-high text-on-surface-variant ring-1 ring-outline-variant/60',
    image: 'object-cover object-top',
  },
  tile: {
    frame: 'rounded-(--radius-control) bg-secondary-container text-on-secondary-container',
    image: 'object-cover',
  },
}

/**
 * @param {keyof typeof THUMB_TONES} tone
 * @param {string} [className] — מידה (h-12 w-9 / size-10) ופריסה
 */
export function thumbFrameClass(tone, className) {
  return cx('flex shrink-0 items-center justify-center overflow-hidden', THUMB_TONES[tone].frame, className)
}
