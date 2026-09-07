export type PluginStatus = 'stable' | 'beta' | 'experimental'

// מחלקות הרקע/טקסט של תגית סטטוס התוסף — משותף בין כרטיס התוסף (PluginCard)
// לדף פרטי תוסף. גודל/ריווח התגית שונים בין שני המקומות, ולכן זהו helper
// טהור (לא רכיב עם עיצוב קבוע) — כל צרכן עוטף אותו ב-span עם ה-classes שלו.
export function statusBadgeClass(status: PluginStatus | string): string {
  if (status === 'stable') return 'bg-primary/10 text-primary'
  if (status === 'beta') return 'bg-primary/15 text-primary'
  return 'bg-primary/20 text-primary'
}
