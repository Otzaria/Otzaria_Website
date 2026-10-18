/** אייקונים מותאמים: שם → מחלקת המסכה */
export const CUSTOM_ICONS = {
  // תרומה — יד מכניסה שטר (זמני; יוחלף בהמשך)
  donate: 'app-icon-donate'
}

/**
 * אייקון אחיד לכל האתר: גליף מגופן Material Symbols (name), או אייקון מותאם (custom) —
 * תמונת מסכה שנצבעת בצבע הטקסט (currentColor) ובגודל 1em, כך שהוא מתנהג בדיוק כמו גליף:
 * אותן מחלקות גודל/צבע/אנימציה חלות על שניהם. אייקון מותאם חדש = קובץ מסכה ב-public/icons
 * + מחלקה ב-styles/effects.css (.app-icon-*) + שורה ב-CUSTOM_ICONS.
 *
 * משפחת האייקונים: AppIcon (גליף / מסכה סטטית) ואייקונים מונפשים ב-ui/icons/* (היום
 * DonateAnimatedIcon — SVG ב-currentColor ובגודל 1em, כמו כאן). המונפשים מיובאים במפורש רק
 * במקום שבו הם מוצגים, ולא דרך AppIcon, כדי שלא ייכנסו לכל חבילה שמשתמשת באייקון.
 *
 * @param {{ name?: string, custom?: keyof typeof CUSTOM_ICONS, className?: string }} props
 */
export default function AppIcon({ name, custom, className = '' }) {
  if (custom && CUSTOM_ICONS[custom]) {
    return <span className={`app-icon ${CUSTOM_ICONS[custom]} ${className}`} aria-hidden="true" />
  }
  return <span className={`material-symbols-outlined ${className}`} aria-hidden="true">{name}</span>
}
