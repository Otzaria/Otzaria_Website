'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FIELD_ERROR, fieldClasses } from '@/components/ui/fieldStyles'

/**
 * מודאל ניהול רשימת ערכים מסוג { key: { label, color } }.
 *
 * ברירות המחדל של המילים מתאימות לסטטוסי ספרים (השימוש המקורי), וניתן
 * להחליף אותן כדי לנהל רשימות דינמיות אחרות (למשל אופני קבלת אישור).
 *
 * @param {object[]} uploads פריטים לספירת שימוש — נספרים לפי השדה `bookStatus`
 *
 * המעטפת — ui/Dialog (גיליון תחתון בטלפון, לכידת פוקוס, Esc). אישור המחיקה — ui/ConfirmDialog
 * (useConfirm), מעל המודאל ובאותה שפה; שדה חסר או מפתח כפול — שגיאה מתחת לשורת ההוספה.
 * ההורה מרכיב את הרכיב בכל פתיחה, ולכן ההגדרות נקראות פעם אחת, במצב ההתחלתי.
 */
export default function StatusConfigModal({
  statuses,
  uploads = [],
  onSave,
  onClose,
  title = 'הגדרות סטטוסים',
  itemNoun = 'סטטוס',
  itemNounPlural = 'סטטוסים',
  usageNoun = 'העלאות',
  defaultKey = 'not_checked',
  // ניסוחים מגדריים — ברירת המחדל היא לשון זכר (סטטוס), וניתן להעביר נקבה
  existingTitle = `${itemNounPlural} קיימים`,
  addTitle = `הוספת ${itemNoun} חדש`,
  assignedText = 'משויך',
  deleteConfirmBody = 'אם תמחק את הסטטוס, ההעלאות האלה יישארו עם סטטוס לא תקין.\n\nמומלץ לשנות את הסטטוס של ההעלאות האלה לפני המחיקה.',
  deleteConfirmQuestion = 'האם אתה בטוח שברצונך למחוק את הסטטוס?',
}) {
  const [confirm, confirmElement] = useConfirm()
  // שמירה באוויר: "שומר…" ב-softDisabled (הפוקוס נשאר), ולחיצה נוספת לא שולחת שוב. onSave יכול להחזיר Promise.
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(editedStatuses)
    } catch {
      // ההודעה על הכישלון — אצל ההורה (טוסט); כאן רק משחררים את הכפתור לניסיון נוסף
    } finally {
      setSaving(false)
    }
  }
  const [editedStatuses, setEditedStatuses] = useState(() => JSON.parse(JSON.stringify(statuses || {})))
  const [newStatusKey, setNewStatusKey] = useState('')
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [newStatusColor, setNewStatusColor] = useState('#94a3b8')
  const [addError, setAddError] = useState('')

  const handleUpdateStatus = (key, field, value) => {
    setEditedStatuses(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }))
  }

  const handleAddStatus = () => {
    if (!newStatusKey || !newStatusLabel) {
      setAddError('צריך למלא מפתח ותווית.')
      return
    }

    if (editedStatuses[newStatusKey]) {
      setAddError(`כבר יש ${itemNoun} עם המפתח הזה.`)
      return
    }

    setAddError('')
    setEditedStatuses(prev => ({
      ...prev,
      [newStatusKey]: {
        label: newStatusLabel,
        color: newStatusColor
      }
    }))

    setNewStatusKey('')
    setNewStatusLabel('')
    setNewStatusColor('#94a3b8')
  }

  const handleDeleteStatus = async (key) => {
    // כמה פריטים משתמשים בערך הזה
    const used = uploads.filter(upload =>
      (upload.bookStatus || defaultKey) === key
    ).length
    const statusLabel = editedStatuses[key].label

    const ok = await confirm(used > 0
      ? {
          title: deleteConfirmQuestion,
          body: (
            <div className="flex flex-col gap-2 whitespace-pre-line">
              <p>{itemNoun} <strong className="text-on-surface">"{statusLabel}"</strong> {assignedText} ל-{used.toLocaleString('he-IL')} {usageNoun}.</p>
              <p>{deleteConfirmBody}</p>
            </div>
          ),
          confirmLabel: 'מחק בכל זאת',
          tone: 'danger',
        }
      : { title: `למחוק את "${statusLabel}"?`, confirmLabel: 'מחק', tone: 'danger' })
    if (!ok) return
    setEditedStatuses((prev) => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      dismissible={!saving}
      className="sm:max-w-3xl"
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} softDisabled={saving}>ביטול</Button>
          <Button variant="filled" size="sm" icon="save" onClick={save} softDisabled={saving}>{saving ? 'שומר…' : 'שמור שינויים'}</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-6">
        {/* רשימת הקיימים */}
        <section aria-labelledby="status-config-existing">
          <h3 id="status-config-existing" className="mb-3 text-title-sm text-on-surface">{existingTitle}</h3>
          <ul className="flex flex-col gap-2">
            {Object.entries(editedStatuses).map(([key, config]) => {
              const booksWithStatus = uploads.filter(upload =>
                (upload.bookStatus || defaultKey) === key
              ).length

              return (
                <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-(--radius-control) bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto]">
                  <div className="min-w-0">
                    <span className="mb-1 flex items-center gap-2 text-label-md text-on-surface-variant">
                      מפתח
                      {booksWithStatus > 0 && <Badge>{booksWithStatus} {usageNoun}</Badge>}
                    </span>
                    <bdi dir="ltr" className="block truncate rounded-(--radius-control) bg-surface-container px-3 py-3 text-body-sm text-on-surface-variant">{key}</bdi>
                  </div>

                  <label className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="mb-1 block text-label-md text-on-surface-variant">תווית</span>
                    <input
                      type="text"
                      value={config.label}
                      onChange={(e) => handleUpdateStatus(key, 'label', e.target.value)}
                      className={fieldClasses()}
                    />
                  </label>

                  <label className="min-w-0">
                    <span className="mb-1 block text-label-md text-on-surface-variant">צבע</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.color}
                        onChange={(e) => handleUpdateStatus(key, 'color', e.target.value)}
                        aria-label={`צבע של ${config.label}`}
                        className="h-12 w-12 shrink-0 cursor-pointer rounded-(--radius-control) border border-outline bg-surface p-1"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={config.color}
                        onChange={(e) => handleUpdateStatus(key, 'color', e.target.value)}
                        aria-label={`קוד הצבע של ${config.label}`}
                        className={fieldClasses({ className: 'w-28' })}
                      />
                    </span>
                  </label>

                  <Button
                    variant="text"
                    size="sm"
                    iconOnly
                    icon="delete"
                    aria-label={`מחק את ${config.label}`}
                    onClick={() => handleDeleteStatus(key)}
                    className="self-end"
                  />
                </li>
              )
            })}
          </ul>
        </section>

        {/* הוספה */}
        <section aria-labelledby="status-config-add" className="border-t border-outline-variant pt-5">
          <h3 id="status-config-add" className="mb-3 text-title-sm text-on-surface">{addTitle}</h3>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
            <label className="min-w-0">
              <span className="mb-1 block text-label-md text-on-surface-variant">מפתח (באנגלית, בלי רווחים)</span>
              <input
                type="text"
                dir="ltr"
                value={newStatusKey}
                onChange={(e) => setNewStatusKey(e.target.value.replace(/\s/g, '_'))}
                placeholder="new_status"
                className={fieldClasses()}
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1 block text-label-md text-on-surface-variant">תווית</span>
              <input
                type="text"
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                placeholder={`${itemNoun} חדש`}
                className={fieldClasses()}
              />
            </label>

            <label>
              <span className="mb-1 block text-label-md text-on-surface-variant">צבע</span>
              <input
                type="color"
                value={newStatusColor}
                onChange={(e) => setNewStatusColor(e.target.value)}
                className="h-12 w-16 cursor-pointer rounded-(--radius-control) border border-outline bg-surface p-1"
              />
            </label>

            <Button variant="tonal" size="sm" icon="add" onClick={handleAddStatus} className="self-end">הוסף</Button>
          </div>
          {addError && <p role="alert" className={FIELD_ERROR}>{addError}</p>}
        </section>
      </div>
      {confirmElement}
    </Dialog>
  )
}
