// החלטה טהורה איך לשלוח שמירה ביציאה מהדף (pagehide), לפי גודל הגוף בבתים.
//
// דפדפנים מגבילים גוף של fetch עם keepalive ל-64KB. כשהגוף גדול מזה, fetch לא נכשלת מיד אלא
// מחזירה הבטחה שנדחית אחר כך — ולכן אי אפשר "לנסות ולראות". מודדים מראש ובוחרים מסלול:
// עד KEEPALIVE_MAX_BYTES — fetch עם keepalive; מעל — sendBeacon (שמחזירה false אם לא קיבלה).

// קצת מתחת ל-64KB, להשאיר מקום לכותרות ולבקשות keepalive אחרות שבדרך
export const KEEPALIVE_MAX_BYTES = 60000
// מגבלת sendBeacon המקובלת (Chrome/Safari). גוף גדול ממנה כמעט בוודאות לא יישלח ביציאה.
export const BEACON_MAX_BYTES = 65536

// גודל המחרוזת בבתים (UTF-8) — עברית היא 2 בתים לתו, לכן אורך המחרוזת לא מספיק
export function byteLength(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length
  return new Blob([str]).size
}

// 'keepalive' | 'beacon'
export function chooseLeaveRoute(bytes) {
  return bytes > KEEPALIVE_MAX_BYTES ? 'beacon' : 'keepalive'
}

// האם שליחה ביציאה צפויה להיכשל (גדול ממגבלת sendBeacon) — אז עדיף לבקש אישור לפני יציאה
export function likelyTooLargeToSendOnLeave(bytes) {
  return bytes > BEACON_MAX_BYTES
}
