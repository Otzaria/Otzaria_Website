'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// משוכפל מ-src/lib/private-sources.js (DEFAULT_STATUS_KEY) — אותו קובץ טוען מודלים
// של mongoose ולכן אינו ניתן לייבוא מרכיב לקוח, כמו CONFIG_KEYS ב-page.jsx.
const DEFAULT_STATUS_KEY = 'missing_info'

const EMPTY_FORM = {
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  obtainedBy: '',
  obtainedByEmail: '',
  obtainedByPhone: '',
  obtainerSameAsOwner: false,
  permissionMethod: '',
  permissionMethodDetail: '',
  permissionDate: '',
  requireCredit: false,
  allowedPlatforms: [],
  conditionsText: '',
  notes: '',
  status: '',
  customFields: [],
}

/** תאריך ל-input[type=date] (yyyy-mm-dd) */
function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const inputClass =
  'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary'

/**
 * מודאל עריכת רשומת מקור לספר פרטי.
 *
 * @param {object} item        פריט הספר (bookPath, bookTitle, record)
 * @param {object} options     { statuses, methods, platforms } — רשימות דינמיות
 * @param {(data:object)=>Promise<void>} onSave
 * @param {()=>void} onDelete  מחיקת הרשומה (רק כשקיימת)
 */
export default function SourceEditModal({ item, options, onSave, onDelete, onClose }) {
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    const record = item?.record
    const statuses = options.statuses || {}
    const defaultStatus = statuses[DEFAULT_STATUS_KEY]
      ? DEFAULT_STATUS_KEY
      : Object.keys(statuses)[0] || ''
    setForm({
      ownerName: record?.ownerName || '',
      ownerEmail: record?.ownerEmail || '',
      ownerPhone: record?.ownerPhone || '',
      obtainedBy: record?.obtainedBy || '',
      obtainedByEmail: record?.obtainedByEmail || '',
      obtainedByPhone: record?.obtainedByPhone || '',
      obtainerSameAsOwner: Boolean(record?.obtainerSameAsOwner),
      permissionMethod: record?.permissionMethod || '',
      permissionMethodDetail: record?.permissionMethodDetail || '',
      permissionDate: toDateInput(record?.permissionDate),
      requireCredit: Boolean(record?.requireCredit),
      allowedPlatforms: Array.isArray(record?.allowedPlatforms) ? [...record.allowedPlatforms] : [],
      conditionsText: record?.conditionsText || '',
      notes: record?.notes || '',
      status: record?.status || defaultStatus,
      customFields: Array.isArray(record?.customFields)
        ? record.customFields.map((f) => ({ label: f.label || '', value: f.value || '' }))
        : [],
    })
    // איפוס הטופס רק בהחלפת פריט; options משמש לברירת מחדל בלבד ולא אמור לאפס הקלדה
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  if (!mounted || !item) return null

  // רשומת סט — המזהה סינתטי ("set:...") ולכן במקומו מוצג תיאור הסט
  const isSet = item.kind === 'set'
  const subtitle = isSet
    ? `סט${item.isManual ? ' ידני' : ''} · ${(item.books || []).length} ספרים · רשומה משותפת`
    : item.bookPath

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))

  const togglePlatform = (key) =>
    setForm((prev) => ({
      ...prev,
      allowedPlatforms: prev.allowedPlatforms.includes(key)
        ? prev.allowedPlatforms.filter((p) => p !== key)
        : [...prev.allowedPlatforms, key],
    }))

  const updateCustomField = (index, field, value) =>
    setForm((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
    }))

  const addCustomField = () =>
    setForm((prev) => ({ ...prev, customFields: [...prev.customFields, { label: '', value: '' }] }))

  const removeCustomField = (index) =>
    setForm((prev) => ({ ...prev, customFields: prev.customFields.filter((_, i) => i !== index) }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        bookPath: item.bookPath,
        bookTitle: item.bookTitle,
        ...form,
        // כשמשיג האישור הוא בעל הזכויות — פרטי הקשר שלו הם של הבעלים,
        // ולא שומרים כפילות שעלולה להתיישן
        ...(form.obtainerSameAsOwner
          ? { obtainedBy: '', obtainedByEmail: '', obtainedByPhone: '' }
          : {}),
        permissionDate: form.permissionDate || null,
      })
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-start gap-4 p-5 border-b">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-neutral-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-feature-600">
                {isSet ? 'library_books' : 'copyright'}
              </span>
              <span className="truncate">{item.bookTitle}</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-1 break-all">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* בעל הזכויות */}
          <fieldset className="border border-neutral-200 rounded-lg p-4">
            <legend className="px-2 text-sm font-bold text-neutral-700">
              בעל הזכויות / מוסר הספר
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-neutral-600 mb-1">שם</label>
                <input
                  type="text"
                  value={form.ownerName}
                  onChange={(e) => setField('ownerName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">מייל</label>
                <input
                  type="email"
                  dir="ltr"
                  value={form.ownerEmail}
                  onChange={(e) => setField('ownerEmail', e.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">טלפון</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={form.ownerPhone}
                  onChange={(e) => setField('ownerPhone', e.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
            </div>
          </fieldset>

          {/* משיג האישור */}
          <fieldset className="border border-neutral-200 rounded-lg p-4">
            <legend className="px-2 text-sm font-bold text-neutral-700">
              מי השיג את האישור
            </legend>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700 mb-3">
              <input
                type="checkbox"
                checked={form.obtainerSameAsOwner}
                onChange={(e) => setField('obtainerSameAsOwner', e.target.checked)}
                className="w-4 h-4"
              />
              זהו אותו אדם — בעל הזכויות עצמו
            </label>
            {!form.obtainerSameAsOwner && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-neutral-600 mb-1">שם</label>
                  <input
                    type="text"
                    value={form.obtainedBy}
                    onChange={(e) => setField('obtainedBy', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 mb-1">מייל</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={form.obtainedByEmail}
                    onChange={(e) => setField('obtainedByEmail', e.target.value)}
                    className={`${inputClass} text-right`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 mb-1">טלפון</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={form.obtainedByPhone}
                    onChange={(e) => setField('obtainedByPhone', e.target.value)}
                    className={`${inputClass} text-right`}
                  />
                </div>
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-600 mb-1">אופן קבלת האישור</label>
              <select
                value={form.permissionMethod}
                onChange={(e) => setField('permissionMethod', e.target.value)}
                className={inputClass}
              >
                <option value="">לא צוין</option>
                {Object.entries(options.methods || {}).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">
                פירוט — איזה מייל / צ&apos;אט / מספר טלפון וכו&apos;
              </label>
              <input
                type="text"
                value={form.permissionMethodDetail}
                onChange={(e) => setField('permissionMethodDetail', e.target.value)}
                placeholder="למשל: כתובת המייל שבה ניתן האישור"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">תאריך האישור</label>
              <input
                type="date"
                value={form.permissionDate}
                onChange={(e) => setField('permissionDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-600 mb-1">סטטוס</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className={inputClass}
              >
                {Object.entries(options.statuses || {}).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-700 pb-2">
                <input
                  type="checkbox"
                  checked={form.requireCredit}
                  onChange={(e) => setField('requireCredit', e.target.checked)}
                  className="w-4 h-4"
                />
                חובת מתן קרדיט
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-2">פלטפורמות מאושרות</label>
            <div className="flex flex-wrap gap-3">
              {Object.entries(options.platforms || {}).map(([key, config]) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-2 text-sm text-neutral-700 px-3 py-1.5 border border-neutral-300 rounded-lg cursor-pointer hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={form.allowedPlatforms.includes(key)}
                    onChange={() => togglePlatform(key)}
                    className="w-4 h-4"
                  />
                  {config.label}
                </label>
              ))}
              {Object.keys(options.platforms || {}).length === 0 && (
                <span className="text-sm text-neutral-500">לא הוגדרו פלטפורמות</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">תנאים נוספים</label>
            <textarea
              rows={3}
              value={form.conditionsText}
              onChange={(e) => setField('conditionsText', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-600 mb-1">הערות</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-700">שדות נוספים</h3>
              <button
                onClick={addCustomField}
                className="px-3 py-1.5 text-sm bg-success-600 text-white rounded-lg hover:bg-success-700 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                הוסף שדה
              </button>
            </div>
            {form.customFields.length === 0 ? (
              <p className="text-sm text-neutral-500">אין שדות נוספים.</p>
            ) : (
              <div className="space-y-2">
                {form.customFields.map((field, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="כותרת"
                      value={field.label}
                      onChange={(e) => updateCustomField(index, 'label', e.target.value)}
                      className={`${inputClass} md:w-1/3`}
                    />
                    <input
                      type="text"
                      placeholder="ערך"
                      value={field.value}
                      onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                      className={inputClass}
                    />
                    <button
                      onClick={() => removeCustomField(index)}
                      className="p-2 text-danger-600 hover:bg-danger-50 rounded transition-colors"
                      title="הסרת שדה"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {item.record?.updatedBy && (
            <p className="text-xs text-neutral-500">
              עודכן לאחרונה על ידי {item.record.updatedBy}
              {item.record.updatedAt
                ? ` | ${new Date(item.record.updatedAt).toLocaleString('he-IL')}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center gap-3 p-5 border-t bg-neutral-50">
          <div>
            {item.record && (
              <button
                onClick={onDelete}
                className="px-4 py-2 text-danger-700 hover:bg-danger-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                מחיקת הרשומה
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-400 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
