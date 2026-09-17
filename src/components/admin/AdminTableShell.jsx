/**
 * AdminTableShell - עטיפה מבנית אחידה לטבלאות בדפי הניהול
 *
 * מספקת רק את ה-wrapper (גלילה אופקית, פינות מעוגלות, מסגרת) המשותף
 * לדפי ניהול רבים. תוכן הטבלה עצמו (thead/tbody) וכן מצב "ריק" נשארים
 * באחריות כל דף בנפרד ומועברים כ-children.
 *
 * @param {React.ReactNode} children - תוכן הטבלה (וייתכן גם מצב ריק) שיוצג בתוך העטיפה
 * @param {string} className - מחלקות CSS נוספות שיתווספו לעטיפה (אופציונלי)
 */
export default function AdminTableShell({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-neutral-200${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
