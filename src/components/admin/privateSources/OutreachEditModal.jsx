'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Notice from '@/components/ui/Notice'
import FormSection from './FormSection'
import ModalField from './ModalField'
import { toDateInput } from './modalFormUtils'
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
 * חלון הזנה/עריכה של פנייה למכון.
 *
 * הכפילות נבדקת *תוך כדי הקלדה* מול כל הפניות שכבר נטענו — כך ששני אנשים
 * שמתכננים לפנות לאותו אדם יראו זאת עוד לפני הפנייה, ולא בדיעבד.
 * השרת בודק שוב בשמירה (409) כדי לתפוס גם הזנה מקבילה משני מסכים.
 *
 * המעטפת — ui/Dialog (לכידת פוקוס, Esc, גיליון תחתון בטלפון); השדות — ModalField; אזהרת הכפילות —
 * ui/Notice. Enter בשדה שולח. פעולה ראשית אחת; "מחק" — אחרון ובאדום.
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
  deleting = false, // מחיקה באוויר — "מחק" כבוי (aria-disabled, בלי לאבד פוקוס)
  onClose,
}) {
  const formId = useId()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  // כפילויות שהשרת החזיר בשמירה (במקרה שנוצרו במקביל ולא היו ברשימה שנטענה)
  const [serverDuplicates, setServerDuplicates] = useState([])

  useEffect(() => {
    const statusKeys = Object.keys(statuses || {})
    const defaultStatus = statuses?.[DEFAULT_OUTREACH_STATUS]
      ? DEFAULT_OUTREACH_STATUS
      : statusKeys[0] || ''
    // eslint-disable-next-line react-hooks/set-state-in-effect -- איפוס הטופס כשהחלון נפתח לפריט אחר (כמו קודם)
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

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))
  const field = (name) => ({ value: form[name], onChange: (value) => setField(name, value) })

  // confirmDuplicate רק מלחיצה מפורשת על הכפתור — Enter בשדה לא יאשר כפילות
  const handleSave = async (confirm = false) => {
    if (saving) return
    setSaving(true)
    try {
      const result = await onSave({
        ...(item?._id ? { _id: item._id } : {}),
        ...form,
        outreachDate: form.outreachDate || null,
        // המשתמש רואה את הכפילות במסך ובוחר להמשיך בכל זאת
        confirmDuplicate: confirm && shownDuplicates.length > 0,
      })
      // השרת דחה בגלל כפילות שלא הכרנו — מציגים אותה ומחכים לאישור נוסף
      if (result?.duplicate) setServerDuplicates(result.duplicates || [])
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={item ? 'עריכת פנייה' : 'פנייה חדשה למכון'}
      subtitle="רישום הפנייה מראש (״הולך ליצור קשר״) מונע פנייה כפולה מאדם אחר."
      onClose={onClose}
      dismissible={!saving}
      className="sm:max-w-3xl"
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} softDisabled={saving}>ביטול</Button>
          <Button
            variant={hasBlockingDuplicate ? 'danger' : 'filled'}
            size="sm"
            icon="save"
            // כשמוצגת כפילות — כפתור רגיל (לא submit), כדי ש-Enter בשדה לא ישמור בלי אישור מפורש
            {...(shownDuplicates.length > 0
              ? { type: 'button', onClick: () => handleSave(true) }
              : { type: 'submit', form: formId })}
            softDisabled={saving}
          >
            {saving ? 'שומר…' : hasBlockingDuplicate ? 'שמור בכל זאת' : 'שמור'}
          </Button>
          {item && (
            <Button variant="text" size="sm" icon="delete" onClick={onDelete} softDisabled={deleting} className="ms-auto text-error! hover:bg-error-container/60!">
              {deleting ? 'מוחק…' : 'מחק את הפנייה'}
            </Button>
          )}
        </>
      )}
    >
      <form id={formId} noValidate className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); handleSave() }}>
        {/* אזהרת כפילות — מוצגת תוך כדי ההקלדה */}
        {shownDuplicates.length > 0 && (
          <Notice
            tone={hasBlockingDuplicate ? 'error' : 'warning'}
            title={hasBlockingDuplicate ? 'שים לב — כבר פנו לנמען הזה!' : 'קיימת פנייה קודמת לנמען הזה'}
          >
            <ul className="mt-2 flex flex-col gap-2">
              {shownDuplicates.slice(0, 5).map((dup) => (
                <li key={dup._id}>
                  <span className="font-semibold">{dup.contactName || dup.instituteName || 'ללא שם'}</span>
                  <span> · {describeDuplicate(dup)}</span>
                  <span> · {statuses?.[dup.status]?.label || dup.status}</span>
                  <span className="block opacity-80">
                    התאמה לפי: {MATCH_REASON_LABELS[dup.reason] || dup.reason}
                    {dup.subject ? ` · ${dup.subject}` : ''}
                  </span>
                </li>
              ))}
              {shownDuplicates.length > 5 && <li>ועוד {shownDuplicates.length - 5} פניות קודמות…</li>}
            </ul>
            <p className="mt-3">
              פנייה חוזרת בתוך {RECENT_DUPLICATE_DAYS} ימים או בזמן שפנייה פתוחה עדיין ממתינה —
              מומלץ לתאם עם מי שפנה קודם. אפשר להמשיך בכל זאת ולציין נימוק.
            </p>
            <ModalField label="נימוק לפנייה נוספת (לא חובה)" className="mt-3" {...field('duplicateReason')} />
          </Notice>
        )}

        <FormSection legend="אל מי פונים">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ModalField label="מכון / מוסד" {...field('instituteName')} />
            <ModalField label="איש קשר" {...field('contactName')} />
            <ModalField label="טלפון" type="tel" ltr {...field('contactPhone')} />
            <ModalField label="מייל" type="email" ltr {...field('contactEmail')} />
          </div>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            חובה למלא לפחות שם מכון או שם איש קשר. טלפון ומייל משפרים את זיהוי הכפילויות.
          </p>
        </FormSection>

        <FormSection legend="פרטי הפנייה">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ModalField label="מי פונה" {...field('outreachBy')} />
            <ModalField label="תאריך הפנייה (או התאריך המתוכנן)" type="date" {...field('outreachDate')} />
            <ModalField label="אופן הפנייה" kind="select" {...field('channel')}>
              <option value="">— ללא —</option>
              {Object.entries(channels || {}).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </ModalField>
            <ModalField label="סטטוס" kind="select" {...field('status')}>
              {Object.entries(statuses || {}).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </ModalField>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            <ModalField label="נושא הפנייה (אילו ספרים / על מה)" kind="textarea" rows={2} {...field('subject')} />
            <ModalField label="תשובת המכון" kind="textarea" {...field('responseText')} />
            <ModalField label="הערות" kind="textarea" {...field('notes')} />
          </div>
        </FormSection>

        {item?.updatedBy && (
          <p className="text-body-sm text-on-surface-variant">
            עודכן לאחרונה על ידי {item.updatedBy}
            {item.updatedAt ? ` | ${new Date(item.updatedAt).toLocaleString('he-IL')}` : ''}
          </p>
        )}
      </form>
    </Dialog>
  )
}
