// צבע הספרה על עיגול מספר-הרצועה. העיגול בצבע הזרם (צבע נתונים קבוע מ-PageCanvas — זהה לרצועה
// בתמונה, בשתי הערכות), ולכן גם הספרה קבועה: לבן או שחור מהפלטה — מה שנותן ניגודיות גבוהה יותר
// (על כתום/ירוק/תכלת לבן נותן רק ~3:1; שחור שם מעל 4.5:1).

const WHITE = 'var(--ref-neutral-100)'
const BLACK = 'var(--ref-neutral-0)'

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** יחס הניגודיות (WCAG) בין שני צבעי hex */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** הספרה על צבע הרקע: { color (טוקן), ratio } */
export function bandInk(bg) {
  const white = contrast(bg, '#ffffff')
  const black = contrast(bg, '#000000')
  return white >= black ? { color: WHITE, ratio: white } : { color: BLACK, ratio: black }
}
