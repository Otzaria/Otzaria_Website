// אילו פעולות יש בכל שורה — לוגיקה טהורה (בלי React), כדי שאפשר לבדוק אותה בנפרד.
//
// היררכיה (דפוסי ה-UX של הניהול): פעולה ראשית אחת גלויה בשורה, תמיד באותו מקום; כל השאר ב-⋮
// בסדר קבוע — עריכה, הודעה, ואחרי מפריד ההרסנית (באדום). פעולה שאין לצופה הרשאה אליה לא מוצגת:
//   הורדה מאוחדת של כמה קבצים (/api/download/batch) — מנהל כללי בלבד; למנהל ספרים הפעולה
//     הראשית של ספר עם כמה קבצים היא "הצג N קבצים" (פותחת את הספר, ושם יש "הורד" לכל קובץ),
//     והמסך מסביר בשורה אחת מה שמור למנהל כללי (UploadsScreen);
//   שלח הודעה (המסלול עובר דרך /api/admin/users) — מנהל כללי בלבד.
import { groupUploaders } from '@/lib/adminUploads/uploadGroups'
import { downloadLabel, filesCountText, formatNumber } from '@/lib/adminUploads/uploadTerms'

/** "למשה" / "ל-John" — מילית היחס צמודה לשם עברי, ועם מקף לשם לועזי */
export function toName(name) {
  const text = String(name || '').trim() || 'אורח'
  return /^[֐-׿]/.test(text) ? `ל${text}` : `ל-${text}`
}

function messageTarget(upload, title) {
  if (!upload?.uploadedByEmail) return null
  return {
    id: upload.uploaderId || null,
    email: upload.uploadedByEmail,
    name: upload.uploadedBy || 'אורח',
    subject: `בנוגע להעלאת הספר: ${title}`,
  }
}

/**
 * הפעולה הראשית של שורת ספר. short — תווית קצרה לרשימה צרה ("הורד (91)"), כשהמלאה ארוכה.
 * onExpand — פתיחת הספר (למנהל ספרים, כשאין לו הורדה מאוחדת).
 * @returns {{ id: string, icon: string, label: string, short?: string, loading?: boolean, onClick: () => void }}
 */
export function primaryAction({ group, variant, permissions, actions, onExpand }) {
  const files = group.visible
  if (variant === 'trash') {
    return {
      id: 'restore', icon: 'restore', label: files.length > 1 ? `שחזר ${filesCountText(files.length)}` : 'שחזר',
      short: files.length > 1 ? `שחזר (${formatNumber(files.length)})` : undefined, onClick: () => actions.restore(files, group),
    }
  }
  if (files.length === 1) {
    return { id: 'download', icon: 'download', label: downloadLabel(1), short: 'הורד', onClick: () => actions.download(files[0]) }
  }
  if (!permissions.batchDownload) {
    return { id: 'expand', icon: 'unfold_more', label: `הצג ${filesCountText(files.length)}`, short: `הצג (${formatNumber(files.length)})`, onClick: () => onExpand?.() }
  }
  return {
    id: 'download-all',
    icon: 'download',
    label: downloadLabel(files.length),
    short: `הורד (${formatNumber(files.length)})`,
    loading: Boolean(actions.isDownloading?.(group.key)),
    onClick: () => actions.downloadCombined(files, group),
  }
}

/**
 * פריטי ⋮ של שורת ספר.
 * @returns {import('@/components/ui/MenuButton').MenuItem[]}
 */
export function groupMenuItems({ group, variant, permissions, actions }) {
  const files = group.visible
  const many = files.length > 1
  if (variant === 'trash') {
    return [{
      id: 'delete-forever', icon: 'delete_forever', danger: true,
      label: many ? `מחק לצמיתות ${filesCountText(files.length)}` : 'מחק לצמיתות',
      onSelect: () => actions.deleteForever(files, group),
    }]
  }

  const items = []
  const copyId = editCopyOf(group)
  if (copyId) items.push({ id: 'edit-copy', icon: 'edit', label: 'ערוך עותק', onSelect: () => actions.openEditCopy(copyId) })
  else items.push({ id: 'create-copy', icon: 'content_copy', label: 'צור עותק עריכה', onSelect: () => actions.createEditCopy(group) })

  if (permissions.message) {
    const uploader = groupUploaders(files)
    const latest = files.find((u) => u.uploadedByEmail === uploader.email)
    const target = messageTarget(latest, group.title)
    if (target) items.push({ id: 'message', icon: 'send', label: `שלח הודעה ${toName(uploader.name)}`, onSelect: () => actions.message(target) })
  }

  items.push({ separator: true, id: 'sep-danger' })
  items.push({
    id: 'trash', icon: 'delete', danger: true,
    label: many ? `מחק ${filesCountText(files.length)}` : 'מחק',
    onSelect: () => actions.trash(files, group),
  })
  return items
}

/** הפעולה הראשית של קובץ בתוך ספר פתוח */
export function itemPrimaryAction({ upload, group, variant, actions }) {
  if (variant === 'trash') return { id: 'restore', icon: 'restore', label: 'שחזר', onClick: () => actions.restore([upload], group) }
  return { id: 'download', icon: 'download', label: downloadLabel(1), short: 'הורד', onClick: () => actions.download(upload) }
}

/** פריטי ⋮ של קובץ בתוך ספר פתוח */
export function itemMenuItems({ upload, group, variant, permissions, actions }) {
  if (variant === 'trash') {
    return [{ id: 'delete-forever', icon: 'delete_forever', danger: true, label: 'מחק לצמיתות', onSelect: () => actions.deleteForever([upload], group) }]
  }
  const items = []
  const target = permissions.message ? messageTarget(upload, group.title) : null
  if (target) {
    items.push({ id: 'message', icon: 'send', label: `שלח הודעה ${toName(upload.uploadedBy)}`, onSelect: () => actions.message(target) })
    items.push({ separator: true, id: 'sep-danger' })
  }
  items.push({ id: 'trash', icon: 'delete', danger: true, label: 'מחק', onSelect: () => actions.trash([upload], group) })
  return items
}

/** מזהה עותק העריכה של הספר (אם יש) */
export function editCopyOf(group) {
  return group.uploads.find((u) => u.editCopy)?.editCopy || null
}

/** שם הקובץ להורדה מאוחדת של ספר */
export function combinedFilename(title) {
  const safe = String(title || 'uploads').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'uploads'
  return `${safe}.txt`
}
