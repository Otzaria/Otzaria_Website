'use client'

import { useEffect, useId, useState } from 'react'
import Button from '@/components/ui/Button'
import CheckRow from '@/components/ui/CheckRow'
import Dialog from '@/components/ui/Dialog'
import FormSection from './FormSection'
import ModalField from './ModalField'
import { toDateInput } from './modalFormUtils'

// משוכפל מ-src/lib/private-sources.js (DEFAULT_STATUS_KEY) — אותו קובץ טוען מודלים
// של mongoose ולכן אינו ניתן לייבוא מרכיב לקוח, כמו CONFIG_KEYS ב-SourcesTab.jsx.
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

/**
 * חלון עריכת רשומת מקור לספר פרטי.
 *
 * המעטפת — ui/Dialog (כמו ManualSetsModal): גיליון תחתון בטלפון, לכידת פוקוס, Esc, כפתור סגירה עם שם.
 * השדות — ModalField (תווית מחוברת, fieldStyles). Enter בשדה שולח את הטופס (כפתור "שמור" מחובר אליו).
 * פעולה ראשית אחת ("שמור"); "מחק" — אחרון ובאדום.
 *
 * @param {object} item        פריט הספר (bookPath, bookTitle, record)
 * @param {object} options     { statuses, methods, platforms } — רשימות דינמיות
 * @param {(data:object)=>Promise<void>} onSave
 * @param {()=>void} onDelete  מחיקת הרשומה (רק כשקיימת)
 * @param {boolean} [deleting]  מחיקה באוויר — "מחק" כבוי (aria-disabled, בלי לאבד פוקוס)
 */
export default function SourceEditModal({ item, options, onSave, onDelete, deleting = false, onClose }) {
  const formId = useId()
  const platformsId = useId()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    const record = item?.record
    const statuses = options.statuses || {}
    const defaultStatus = statuses[DEFAULT_STATUS_KEY]
      ? DEFAULT_STATUS_KEY
      : Object.keys(statuses)[0] || ''
    // eslint-disable-next-line react-hooks/set-state-in-effect -- איפוס הטופס כשהחלון נפתח לפריט אחר (כמו קודם)
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

  if (!item) return null

  // רשומת סט — המזהה סינתטי ("set:...") ולכן במקומו מוצג תיאור הסט
  const isSet = item.kind === 'set'
  const subtitle = isSet
    ? `סט${item.isManual ? ' ידני' : ''} · ${(item.books || []).length} ספרים · פרטי מקור משותפים`
    : item.bookPath

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))
  const field = (name) => ({ value: form[name], onChange: (value) => setField(name, value) })

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
    if (saving) return
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

  const platforms = Object.entries(options.platforms || {})

  return (
    <Dialog
      title={item.bookTitle}
      subtitle={<span className="break-all">{subtitle}</span>}
      onClose={onClose}
      dismissible={!saving}
      className="sm:max-w-3xl"
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} softDisabled={saving}>ביטול</Button>
          <Button variant="filled" size="sm" icon="save" type="submit" form={formId} softDisabled={saving}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
          {item.record && (
            <Button variant="text" size="sm" icon="delete" onClick={onDelete} softDisabled={deleting} className="ms-auto text-error! hover:bg-error-container/60!">
              {deleting ? 'מוחק…' : 'מחק את פרטי המקור'}
            </Button>
          )}
        </>
      )}
    >
      <form id={formId} noValidate className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); handleSave() }}>
        <FormSection legend="בעל הזכויות / מוסר הספר">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ModalField label="שם" {...field('ownerName')} />
            <ModalField label="מייל" type="email" ltr {...field('ownerEmail')} />
            <ModalField label="טלפון" type="tel" ltr {...field('ownerPhone')} />
          </div>
        </FormSection>

        <FormSection legend="מי השיג את האישור">
          <CheckRow checked={form.obtainerSameAsOwner} onChange={(checked) => setField('obtainerSameAsOwner', checked)}>
            זהו אותו אדם — בעל הזכויות עצמו
          </CheckRow>
          {!form.obtainerSameAsOwner && (
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
              <ModalField label="שם" {...field('obtainedBy')} />
              <ModalField label="מייל" type="email" ltr {...field('obtainedByEmail')} />
              <ModalField label="טלפון" type="tel" ltr {...field('obtainedByPhone')} />
            </div>
          )}
        </FormSection>

        <FormSection legend="האישור">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ModalField label="אופן קבלת האישור" kind="select" {...field('permissionMethod')}>
              <option value="">לא צוין</option>
              {Object.entries(options.methods || {}).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </ModalField>
            <ModalField label="פירוט — איזה מייל / צ'אט / מספר טלפון וכו'" placeholder="למשל: כתובת המייל שבה ניתן האישור" {...field('permissionMethodDetail')} />
            <ModalField label="תאריך האישור" type="date" {...field('permissionDate')} />
            <ModalField label="סטטוס" kind="select" {...field('status')}>
              {Object.entries(options.statuses || {}).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </ModalField>
          </div>
          <CheckRow className="mt-2" checked={form.requireCredit} onChange={(checked) => setField('requireCredit', checked)}>
            חובת מתן קרדיט
          </CheckRow>
        </FormSection>

        <div role="group" aria-labelledby={platformsId}>
          <p id={platformsId} className="mb-1 text-label-md text-on-surface">פלטפורמות מאושרות</p>
          {platforms.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">לא הוגדרו פלטפורמות</p>
          ) : (
            <div className="flex flex-wrap gap-x-6">
              {platforms.map(([key, config]) => (
                <CheckRow key={key} checked={form.allowedPlatforms.includes(key)} onChange={() => togglePlatform(key)}>
                  {config.label}
                </CheckRow>
              ))}
            </div>
          )}
        </div>

        <ModalField label="תנאים נוספים" kind="textarea" {...field('conditionsText')} />
        <ModalField label="הערות" kind="textarea" {...field('notes')} />

        <FormSection legend="שדות נוספים">
          {form.customFields.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">אין שדות נוספים.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {form.customFields.map((custom, index) => (
                <li key={index} className="flex items-end gap-2">
                  <ModalField label={`כותרת ${index + 1}`} className="flex-1 md:max-w-60" value={custom.label}
                    onChange={(value) => updateCustomField(index, 'label', value)} />
                  <ModalField label={`ערך ${index + 1}`} className="flex-2" value={custom.value}
                    onChange={(value) => updateCustomField(index, 'value', value)} />
                  <Button variant="text" size="md" iconOnly icon="delete" aria-label={`הסר את שדה ${index + 1}`}
                    onClick={() => removeCustomField(index)} className="text-error! hover:bg-error-container/60!" />
                </li>
              ))}
            </ul>
          )}
          <Button variant="tonal" size="sm" icon="add" onClick={addCustomField} className="mt-3">הוסף שדה</Button>
        </FormSection>

        {item.record?.updatedBy && (
          <p className="text-body-sm text-on-surface-variant">
            עודכן לאחרונה על ידי {item.record.updatedBy}
            {item.record.updatedAt
              ? ` | ${new Date(item.record.updatedAt).toLocaleString('he-IL')}`
              : ''}
          </p>
        )}
      </form>
    </Dialog>
  )
}
