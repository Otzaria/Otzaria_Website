// הפעולות של תוסף — אותן פעולות בתפריט ⋮ של השורה ובמגירה, בסדר אחד: הרגילות, ואחרונה (אחרי מפריד,
// באדום) — ההרסנית. השמות לפי מילון השמות (סעיף 6).
import { approveLabel, rejectLabel } from '@/lib/adminPlugins/pluginTerms'
import { startDownload } from '@/components/admin/list/adminRequest'

/** הורדת קובץ התוסף; בעדכון שממתין — הקובץ שהוגש */
export function downloadHref(plugin, { pending = false } = {}) {
  return `/api/plugins/${plugin._id}/download${pending && plugin.pendingUpdate ? '?pending=1' : ''}`
}

/** דף "הגשות השירות" של תוסף שירות (בחנות, לא בניהול) */
export const serviceHref = (plugin) => `/plugins/${plugin._id}/service`

const go = (href) => () => { window.location.href = href }

/** הורדה בלי לעזוב את המסך: תשובת שגיאה מהשרת לא מחליפה את העמוד בדף JSON (המשותף — admin/list/adminRequest) */
export { startDownload }

/**
 * ⋮ בשורה של "לאישור". withDecision — גם "אשר" ו"דחה" (ברשימה צרה, שבה הכפתורים לא גלויים).
 * @param {{ plugin: any, actions: Record<string, Function>, onOpen: (plugin: any) => void, busy?: boolean, withDecision?: boolean }} options
 */
export function pendingMenuItems({ plugin, actions, onOpen, busy = false, withDecision = false }) {
  const items = []
  if (withDecision) items.push({ id: 'approve', icon: 'check', label: approveLabel(plugin), onSelect: () => actions.approve(plugin), disabled: busy })
  items.push({ id: 'open', icon: 'info', label: 'פתח פרטים', onSelect: () => onOpen(plugin) })
  items.push({ id: 'download', icon: 'download', label: 'הורד לבדיקה', onSelect: () => startDownload(downloadHref(plugin, { pending: true })) })
  if (withDecision) {
    items.push({ separator: true, id: 'sep' })
    items.push({ id: 'reject', icon: 'close', label: rejectLabel(plugin), danger: true, onSelect: () => actions.reject(plugin), disabled: busy })
  }
  return items
}

/**
 * ⋮ בשורה של "בחנות" ורשימת הפעולות במגירה. לתוסף שירות אין "החזר להמתנה" (השרת חוסם — 409); מסירים
 * אותו מהחנות ב"השהה". עריכה — דרך הגשה חדשה בדף השירות.
 * כשיש עדכון שממתין, השרת מוחק רק אותו, ולכן הפעולה האחרונה נקראת כך ולא "מחק לצמיתות".
 * @param {{ plugin: any, actions: Record<string, Function>, onAssign?: (plugin: any) => void, busy?: boolean }} options
 */
export function storeMenuItems({ plugin, actions, onAssign, busy = false }) {
  const suspended = plugin.isSuspended === true
  const items = []
  if (onAssign) items.push({ id: 'assign', icon: 'category', label: 'ערוך שיבוץ', onSelect: () => onAssign(plugin) })
  items.push(plugin.hasService
    ? { id: 'service', icon: 'hub', label: 'הגשות השירות', onSelect: go(serviceHref(plugin)) }
    : { id: 'edit', icon: 'edit', label: 'ערוך פרטים', onSelect: () => actions.edit(plugin), disabled: busy })
  items.push(suspended
    ? { id: 'resume', icon: 'play_circle', label: 'החזר לחנות', onSelect: () => actions.resume([plugin]), disabled: busy }
    : { id: 'suspend', icon: 'pause_circle', label: 'השהה', onSelect: () => actions.suspend([plugin]), disabled: busy })
  if (!plugin.hasService) items.push({ id: 'unapprove', icon: 'undo', label: 'החזר להמתנה', onSelect: () => actions.unapprove(plugin), disabled: busy })
  items.push({ id: 'download', icon: 'download', label: 'הורד את התוסף', onSelect: () => startDownload(downloadHref(plugin)) })
  items.push({ separator: true, id: 'sep' })
  items.push(plugin.pendingUpdate
    ? { id: 'delete', icon: 'close', label: 'דחה את העדכון שממתין', danger: true, onSelect: () => actions.reject(plugin), disabled: busy }
    : { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, onSelect: () => actions.deleteForever(plugin), disabled: busy })
  return items
}
