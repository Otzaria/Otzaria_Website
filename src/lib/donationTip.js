// לוגיקה טהורה לכרטיס רמז התרומה (DonationButton): פיצול המשפט לשתי שורות, והזזה פנימה
// כשהכרטיס הממורכז מתחת לכפתור חורג מקצה המסך.

/**
 * "אין לאוצריא גוף מממן: אתה הכוח המניע שלה" → פתיח (עם הנקודתיים) והדגשה.
 * בלי נקודתיים — הכל הדגשה.
 * @param {string} hint
 * @returns {{ lead: string, punch: string }}
 */
export function splitHint(hint) {
  const text = String(hint ?? '').trim()
  const at = text.indexOf(':')
  if (at === -1) return { lead: '', punch: text }
  return { lead: text.slice(0, at + 1).trim(), punch: text.slice(at + 1).trim() }
}

/**
 * כמה להזיז (px, חיובי = ימינה) כרטיס ממורכז על centerX ברוחב width, כדי שיישאר לפחות
 * margin מקצות המסך. כרטיס רחב מהמסך כולו — ממורכז במסך.
 * @param {{ centerX: number, width: number, viewportWidth: number, margin?: number }} input
 */
export function clampShift({ centerX, width, viewportWidth, margin = 12 }) {
  if (!(width > 0) || !(viewportWidth > 0)) return 0
  if (width + margin * 2 >= viewportWidth) return Math.round(viewportWidth / 2 - centerX)
  const left = centerX - width / 2
  const right = centerX + width / 2
  if (left < margin) return Math.round(margin - left)
  if (right > viewportWidth - margin) return Math.round(viewportWidth - margin - right)
  return 0
}
