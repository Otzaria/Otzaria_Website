/**
 * כותרת אזור בדשבורד: h2 בסגנון כותרת קטע של חנות התוספים (title-lg, Assistant) — כך היא
 * משנית בבירור ל"ניהול" (h1 בגופן התצוגה, במעטפת) ולא מתחרה בה.
 * tabIndex=-1 — יעד לפוקוס אחרי "נסה שוב" (כשכרטיס השגיאה והכפתור שבו נעלמים).
 * subtitle — טקסט, או שלד טעינה. action — כפתור בקצה השורה (למשל "לניהול הספרים").
 */
export default function DashboardSectionHeading({ id, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} tabIndex={-1} className="text-title-lg text-on-surface outline-none">{title}</h2>
        {subtitle && <div className="text-body-md text-on-surface-variant">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}
