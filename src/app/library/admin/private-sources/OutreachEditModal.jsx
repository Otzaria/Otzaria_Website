'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import usePortalMounted from './usePortalMounted'
import { toDateInput, inputClass } from './modalFormUtils'
import {
  DEFAULT_OUTREACH_STATUS,
  MATCH_REASON_LABELS,
  RECENT_DUPLICATE_DAYS,
  describeDuplicate,
  findDuplicates,
} from '@/lib/institute-outreach'

const EMPTY_FORM = {
  instituteName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  outreachBy: '',
  outreachDate: '',
  channel: '',
  subject: '',
  responseText: '',
  notes: '',
  status: DEFAULT_OUTREACH_STATUS,
  duplicateReason: '',
}

/**
 * מודאל הזנה/עריכה של פנייה למכון.
 *
 * הכפילות נבדקת *תוך כדי הקלדה* מול כל הפניות שכבר נטענו — כך ששני אנשים
 * שמתכננים לפנות לאותו אדם יראו זאת עוד לפני הפנייה, ולא בדיעבד.
 * השרת בודק שוב בשמירה (409) כדי לתפוס גם הזנה מקבילה משני מסכים.
 *
 * @param {object|null} item      הפנייה לעריכה, או null לפנייה חדשה
 * @param {Array}  allItems       כל הפניות הקיימות (לבדיקת כפילות מיידית)
 * @param {object} statuses       רשימת סטטוסים דינמית
 * @param {object} channels       אופני פנייה (משותף עם "אופני קבלת אישור")
 * @param {string} defaultOutreachBy  שם המשתמש המחובר, כברירת מחדל ל"מי פנה"
 */
export default function OutreachEditModal({
  item,
  allItems,
  statuses,
  channels,
  defaultOutreachBy = '',
  onSave,
  onDelete,
  onClose,
}) {
  const mounted = usePortalMounted()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  // כפילויות שהשרת החזיר בשמירה (במקרה שנוצרו במקביל ולא היו ברשימה שנטענה)
  const [serverDuplicates, setServerDuplicates] = useState([])

  useEffect(() => {
    const statusKeys = Object.keys(statuses || {})
    const defaultStatus = statuses?.[DEFAULT_OUTREACH_STATUS]
      ? DEFAULT_OUTREACH_STATUS
      : statusKeys[0] || ''
    setForm({
      instituteName: item?.instituteName || '',
      contactName: item?.contactName || '',
      contactPhone: item?.contactPhone || '',
      contactEmail: item?.contactEmail || '',
      outreachBy: item?.outreachBy || (item ? '' : defaultOutreachBy),
      outreachDate: item ? toDateInput(item.outreachDate) : toDateInput(new Date()),
      channel: item?.channel || '',
      subject: item?.subject || '',
      responseText: item?.responseText || '',
      notes: item?.notes || '',
      status: item?.status || defaultStatus,
      duplicateReason: item?.duplicateReason || '',
    })
    setServerDuplicates([])
    // איפוס הטופס רק בהחלפת פנייה; שאר ה-props הם ברירות מחדל בלבד
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  // בדיקה חיה מול הרשימה שנטענה — לא ממתינה לשמירה
  const duplicates = useMemo(() => {
    if (!form.contactName && !form.contactPhone && !form.contactEmail && !form.instituteName) {
      return []
    }
    return findDuplicates(allItems, form, item?._id || '')
  }, [allItems, form, item])

  const shownDuplicates = serverDuplicates.length ? serverDuplicates : duplicates
  const hasBlockingDuplicate = shownDuplicates.some((dup) => dup.isRecent || dup.isOpen)

  if (!mounted) return null

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await onSave({
        ...(item?._id ? { _id: item._id } : {}),
        ...form,
        outreachDate: form.outreachDate || null,
        // המשתמש רואה את הכפילות במסך ובוחר להמשיך בכל זאת
        confirmDuplicate: shownDuplicates.length > 0,
      })
      // השרת דחה בגלל כפילות שלא הכרנו — מציגים אותה ומחכים לאישור נוסף
      if (result?.duplicate) setServerDuplicates(result.duplicates || [])
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
              <span className="material-symbols-outlined text-feature-600">contact_phone</span>
              <span className="truncate">{item ? 'עריכת פנייה' : 'פנייה חדשה למכון'}</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              רישום הפנייה מראש (״הולך ליצור קשר״) מונע פנייה כפולה מאדם אחר.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* אזהרת כפילות — מוצגת תוך כדי ההקלדה */}
          {shownDuplicates.length > 0 && (
            <div
              className={`rounded-lg border p-4 ${
                hasBlockingDuplicate
                  ? 'border-danger-300 bg-danger-50'
                  : 'border-warning-300 bg-warning-50'
              }`}
            >
              <p
                className={`font-bold flex items-center gap-2 ${
                  hasBlockingDuplicate ? 'text-danger-700' : 'text-warning-700'
                }`}
              >
                <span className="material-symbols-outlined">warning</span>
                {hasBlockingDuplicate
                  ? 'שים לב — כבר פנו לנמען הזה!'
                  : 'קיימת פנייה קודמת לנמען הזה'}
              </p>
              <div className="mt-3 space-y-2">
                {shownDuplicates.slice(0, 5).map((dup) => (
                  <div
                    key={dup._id}
                    className="text-sm text-neutral-700 bg-white/70 rounded px-3 py-2"
                  >
                    <span className="font-medium">
                      {dup.contactName || dup.instituteName || 'ללא שם'}
                    </span>
                    <span className="text-neutral-500"> · {describeDuplicate(dup)}</span>
                    <span className="text-neutral-500">
                      {' '}
                      · {statuses?.[dup.status]?.label || dup.status}
                    </span>
                    <span className="text-xs text-neutral-500 block">
                      התאמה לפי: {MATCH_REASON_LABELS[dup.reason] || dup.reason}
                      {dup.subject ? ` · ${dup.subject}` : ''}
                    </span>
                  </div>
                ))}
                {shownDuplicates.length > 5 && (
                  <p className="text-xs text-neutral-600">
                    ועוד {shownDuplicates.length - 5} פניות קודמות…
                  </p>
                )}
              </div>
              <p className="text-xs text-neutral-600 mt-3">
                פנייה חוזרת בתוך {RECENT_DUPLICATE_DAYS} ימים או בזמן שפנייה פתוחה עדיין ממתינה —
                מומלץ לתאם עם מי שפנה קודם. אפשר להמשיך בכל זאת ולציין נימוק.
              </p>
              <input
                type="text"
                value={form.duplicateReason}
                onChange={(e) => setField('duplicateReason', e.target.value)}
                placeholder="נימוק לפנייה נוספת (לא חובה)"
                className={`${inputClass} mt-2`}
              />
            </div>
          )}

          {/* הנמען */}
          <fieldset className="border border-neutral-200 rounded-lg p-4">
            <legend className="px-2 text-sm font-bold text-neutral-700">אל מי פונים</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-600 mb-1">מכון / מוסד</label>
                <input
                  type="text"
                  value={form.instituteName}
                  onChange={(e) => setField('instituteName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">איש קשר</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setField('contactName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">טלפון</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={form.contactPhone}
                  onChange={(e) => setField('contactPhone', e.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">מייל</label>
                <input
                  type="email"
                  dir="ltr"
                  value={form.contactEmail}
                  onChange={(e) => setField('contactEmail', e.target.value)}
                  className={`${inputClass} text-right`}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              חובה למלא לפחות שם מכון או שם איש קשר. טלפון ומייל משפרים את זיהוי הכפילויות.
            </p>
          </fieldset>

          {/* הפנייה */}
          <fieldset className="border border-neutral-200 rounded-lg p-4">
            <legend className="px-2 text-sm font-bold text-neutral-700">פרטי הפנייה</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-600 mb-1">מי פונה</label>
                <input
                  type="text"
                  value={form.outreachBy}
                  onChange={(e) => setField('outreachBy', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">
                  תאריך הפנייה (או התאריך המתוכנן)
                </label>
                <input
                  type="date"
                  value={form.outreachDate}
                  onChange={(e) => setField('outreachDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">אופן הפנייה</label>
                <select
                  value={form.channel}
                  onChange={(e) => setField('channel', e.target.value)}
                  className={inputClass}
                >
                  <option value="">— ללא —</option>
                  {Object.entries(channels || {}).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-600 mb-1">סטטוס</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className={inputClass}
                >
                  {Object.entries(statuses || {}).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs text-neutral-600 mb-1">
                נושא הפנייה (אילו ספרים / על מה)
              </label>
              <textarea
                rows={2}
                value={form.subject}
                onChange={(e) => setField('subject', e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs text-neutral-600 mb-1">תשובת המכון</label>
              <textarea
                rows={3}
                value={form.responseText}
                onChange={(e) => setField('responseText', e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mt-4">
              <label className="block text-xs text-neutral-600 mb-1">הערות</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className={inputClass}
              />
            </div>
          </fieldset>

          {item?.updatedBy && (
            <p className="text-xs text-neutral-500">
              עודכן לאחרונה על ידי {item.updatedBy}
              {item.updatedAt ? ` | ${new Date(item.updatedAt).toLocaleString('he-IL')}` : ''}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center gap-3 p-5 border-t bg-neutral-50">
          <div>
            {item && (
              <button
                onClick={onDelete}
                className="px-4 py-2 text-danger-700 hover:bg-danger-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                מחיקת הפנייה
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
              className={`px-5 py-2 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 ${
                hasBlockingDuplicate
                  ? 'bg-danger-600 text-white'
                  : 'bg-primary text-on-primary'
              }`}
            >
              <span className="material-symbols-outlined text-sm">save</span>
              {saving ? 'שומר...' : hasBlockingDuplicate ? 'שמירה בכל זאת' : 'שמירה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
