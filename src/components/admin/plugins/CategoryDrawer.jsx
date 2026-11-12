'use client'

import { useEffect, useId, useState } from 'react'
import ActionList from '@/components/ui/ActionList'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Switch from '@/components/ui/Switch'
import FormField from '@/components/plugins/form/FormField'
import { errorToast } from '@/components/admin/list/adminRequest'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  categoryFormDirty, categoryFormErrors, categoryPayload, categoryPluginsDirty, clientSlugify, initialCategoryForm,
} from '@/lib/adminPlugins/storeLayout'
import OrderedPluginList from './OrderedPluginList'
import { createCategory, deleteCategory, setCategoryPlugins, updateCategory } from './pluginsApi'

const FORM_FIELD = '[&>label]:mb-1.5'
const ghostText = (count) => (count === 1 ? 'תוסף אחד שנמחק עדיין רשום כאן. הוא יוסר בשמירה.' : `${count} תוספים שנמחקו עדיין רשומים כאן. הם יוסרו בשמירה.`)

/**
 * מגירת קטגוריה בחנות (היה חלון CategoryModal): הפרטים (שם, כתובת, תיאור, אייקון, הצגה בדף הבית, סדר),
 * ובקטגוריה קיימת — התוספים שבה, בסדר. כפתור שמירה אחד בתחתית המגירה: הוא שולח רק את מה שהשתנה (שתי
 * הבקשות הקיימות, פרטים ותוספים, בלי שינוי בגוף שלהן). אם הפרטים נשמרו והתוספים לא — ההודעה אומרת את
 * זה, ושמירה נוספת שולחת רק את מה שנשאר.
 * קטגוריה לפי הדירוג בלי תוספים קבועים: הסדר ברשימה לא משפיע, ולכן בלי גרירה ובלי חצים.
 * שינוי שלא נשמר — "לצאת בלי לשמור?" בסגירה, ואזהרת הדפדפן ברענון; קישור ו"אחורה" — אצל המסך (onDirtyChange).
 * מחיקה — אחרונה, באדום, עם חלון אישור (התוספים עצמם לא נמחקים).
 *
 * @param {{ category: any | null, options: any[], onClose: () => void, onChanged: () => Promise<void>, toast: any, confirm: Function,
 *   onDirtyChange?: (dirty: boolean) => void }} props
 */
export default function CategoryDrawer({ category, options, onClose, onChanged, toast, confirm, onDirtyChange }) {
  const isEdit = Boolean(category)
  const ids = { name: useId(), slug: useId(), desc: useId(), icon: useId(), limit: useId(), top: useId(), plugins: useId() }
  const [form, setForm] = useState(() => initialCategoryForm(category))
  const [savedForm, setSavedForm] = useState(form)
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [showErrors, setShowErrors] = useState(false)
  const [assigned, setAssigned] = useState(category?.plugins || [])
  const [savedAssigned, setSavedAssigned] = useState(assigned)
  const [saving, setSaving] = useState(null) // 'save' | 'delete'

  const errors = categoryFormErrors(form)
  const detailsDirty = categoryFormDirty(form, savedForm)
  const assignDirty = categoryPluginsDirty(assigned, savedAssigned)
  const ghosts = isEdit ? category.ghostCount || 0 : 0
  const dirty = detailsDirty || assignDirty
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const { guardLeave } = useUnsavedChangesGuard(dirty, () => confirm(unsavedConfirm('השינויים בקטגוריה לא נשמרו.')), { trapBack: false, guardLinks: false })
  const close = async () => { if (await guardLeave()) onClose() }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const setName = (value) => setForm((f) => ({ ...f, name: value, slug: slugTouched ? f.slug : clientSlugify(value) }))

  const save = async () => {
    const invalid = ['name', 'slug', 'homeLimit', 'manualTopCount'].find((key) => errors[key])
    if (invalid) {
      setShowErrors(true)
      document.getElementById({ name: ids.name, slug: ids.slug, homeLimit: ids.limit, manualTopCount: ids.top }[invalid])?.focus()
      return
    }
    const slugChanged = isEdit && form.slug !== savedForm.slug
    if (slugChanged && !(await confirm({
      title: 'לשנות את הכתובת?',
      body: 'קישורים קיימים לדף הקטגוריה יפסיקו לעבוד.',
      confirmLabel: 'שנה כתובת',
    }))) return

    setSaving('save')
    let detailsSaved = false
    try {
      const payload = categoryPayload(form)
      if (!isEdit) await createCategory(payload)
      else if (detailsDirty) await updateCategory(category.id, { ...payload, isVisible: form.isVisible })
      if (!isEdit || detailsDirty) {
        detailsSaved = true
        setSavedForm(form)
      }
      if (isEdit && (assignDirty || ghosts > 0)) {
        const result = await setCategoryPlugins(category.id, assigned.map((p) => p.id))
        const next = result.category?.plugins || assigned
        setAssigned(next)
        setSavedAssigned(next)
      }
    } catch (error) {
      const toastBody = errorToast(error, 'לא הצלחנו לשמור את הקטגוריה.')
      toast.show(detailsSaved ? { ...toastBody, message: `הפרטים נשמרו, אבל התוספים בקטגוריה לא. ${toastBody.message}` } : toastBody)
      setSaving(null)
      if (detailsSaved) onChanged().catch(() => {})
      return
    }
    setSaving(null)
    toast.show({ tone: 'success', message: isEdit ? 'הקטגוריה נשמרה' : `הקטגוריה ״${form.name.trim()}״ נוצרה` })
    if (!isEdit) onClose()
    await onChanged().catch(() => toast.show({ tone: 'info', message: 'השינוי נשמר, אבל לא הצלחנו לרענן את הרשימה. רענן את העמוד.' }))
  }

  const remove = async () => {
    const count = category.plugins.length
    if (!(await confirm({
      title: 'למחוק את הקטגוריה?',
      body: `הקטגוריה ״${category.name}״ תימחק.`,
      details: [count > 0 ? `${count === 1 ? 'התוסף שבה לא יימחק' : `${count} התוספים שבה לא יימחקו`} — רק יוצאו מהקטגוריה.` : 'אין בה תוספים.', 'אי אפשר לשחזר.'],
      confirmLabel: 'מחק קטגוריה',
      tone: 'danger',
    }))) return
    setSaving('delete')
    try {
      await deleteCategory(category.id)
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו למחוק את הקטגוריה.'))
      setSaving(null)
      return
    }
    onClose()
    toast.show({ message: `הקטגוריה ״${category.name}״ נמחקה` })
    await onChanged().catch(() => toast.show({ tone: 'info', message: 'הקטגוריה נמחקה, אבל לא הצלחנו לרענן את הרשימה. רענן את העמוד.' }))
  }

  const err = (key) => (showErrors ? errors[key] : undefined)
  const top = Number(form.manualTopCount) || 0
  const orderMatters = form.sortMode === 'manual' || top > 0

  return (
    <Drawer
      title={isEdit ? category.name : 'קטגוריה חדשה'}
      subtitle={isEdit ? `${assigned.length} תוספים` : 'בחנות התוספים'}
      onClose={close}
      dismissible={saving === null}
      returnFocus={() => document.querySelector('[data-new-category]')}
      footer={(
        <>
          {dirty && <p role="status" className="me-auto min-w-0 text-body-sm text-on-surface-variant">יש שינויים שלא נשמרו</p>}
          <Button variant="filled" size="sm" icon="save" onClick={save} loading={saving === 'save'} disabled={saving !== null || (isEdit && !dirty && ghosts === 0)}>
            {isEdit ? 'שמור שינויים' : 'צור קטגוריה'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <FormField id={ids.name} label="שם" error={err('name')} className={FORM_FIELD}>
            <input {...fieldA11yProps(ids.name, { error: err('name') })} value={form.name} onChange={(e) => setName(e.target.value)} placeholder="למשל: כלי לימוד" className={fieldClasses({ invalid: Boolean(err('name')) })} />
          </FormField>
          <FormField id={ids.slug} label="כתובת הדף" hint="באנגלית: אותיות קטנות, ספרות ומקפים. למשל study-tools." error={err('slug')} className={FORM_FIELD}>
            <input
              {...fieldA11yProps(ids.slug, { hint: true, error: err('slug') })}
              dir="ltr"
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()) }}
              placeholder="study-tools"
              className={fieldClasses({ invalid: Boolean(err('slug')) })}
            />
          </FormField>
          <FormField id={ids.desc} label="תיאור" hint="לא חובה. מוצג בראש דף הקטגוריה." className={FORM_FIELD}>
            <textarea {...fieldA11yProps(ids.desc, { hint: true })} value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} className={fieldClasses({ kind: 'textarea' })} />
          </FormField>
          <FormField id={ids.icon} label="אייקון" hint="לא חובה. השם באנגלית של הסמל, למשל menu_book. בריבוע רואים איך הוא ייראה." className={FORM_FIELD}>
            <span className="flex items-center gap-3">
              <input {...fieldA11yProps(ids.icon, { hint: true })} dir="ltr" value={form.icon} onChange={(e) => set('icon', e.target.value)} className={fieldClasses({ className: 'flex-1' })} />
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-(--radius-control) bg-secondary-container text-on-secondary-container">
                {form.icon.trim() ? <AppIcon name={form.icon.trim()} className="text-icon-xl" /> : <span className="text-label-md">—</span>}
              </span>
            </span>
          </FormField>

          <div className="flex flex-col gap-1 rounded-(--radius-control) bg-surface">
            <Switch checked={form.showOnHome} onChange={(v) => set('showOnHome', v)} label="הצג בדף הבית" description="שורה של הקטגוריה בדף הבית של החנות." className="px-3" />
            {isEdit && <Switch checked={form.isVisible} onChange={(v) => set('isVisible', v)} label="גלויה בחנות" description="קטגוריה מוסתרת לא מוצגת בכלל." className="px-3" />}
          </div>
          {form.showOnHome && (
            <FormField id={ids.limit} label="כמה תוספים בשורה בדף הבית" hint="בין 3 ל-12." error={err('homeLimit')} className={FORM_FIELD}>
              <input {...fieldA11yProps(ids.limit, { hint: true, error: err('homeLimit') })} type="number" min={3} max={12} value={form.homeLimit} onChange={(e) => set('homeLimit', e.target.value)} className={fieldClasses({ className: 'w-32', invalid: Boolean(err('homeLimit')) })} />
            </FormField>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-label-lg text-on-surface">סדר התוספים בקטגוריה</p>
            <SegmentedControl
              label="סדר התוספים בקטגוריה"
              value={form.sortMode}
              onChange={(v) => set('sortMode', v)}
              options={[{ value: 'rating', label: 'לפי הדירוג' }, { value: 'manual', label: 'סדר קבוע' }]}
            />
            <p className="text-body-sm text-on-surface-variant">
              {form.sortMode === 'rating' ? 'התוספים עם הדירוג הגבוה מוצגים ראשונים. אפשר לקבע כמה בראש.' : 'בדיוק הסדר שברשימה למטה. הדירוג לא משנה.'}
            </p>
          </div>
          {form.sortMode === 'rating' && (
            <FormField id={ids.top} label="כמה תוספים קבועים בראש" hint={top > 0 ? `${top} הראשונים ברשימה נשארים במקום, והשאר לפי הדירוג.` : 'כולם לפי הדירוג.'} error={err('manualTopCount')} className={FORM_FIELD}>
              <input {...fieldA11yProps(ids.top, { hint: true, error: err('manualTopCount') })} type="number" min={0} max={20} value={form.manualTopCount} onChange={(e) => set('manualTopCount', e.target.value)} className={fieldClasses({ className: 'w-32', invalid: Boolean(err('manualTopCount')) })} />
            </FormField>
          )}
        </section>

        {isEdit && (
          <section aria-labelledby={ids.plugins} className="flex flex-col gap-3 border-t border-outline-variant pt-6">
            <h3 id={ids.plugins} className="text-title-sm text-on-surface">התוספים בקטגוריה ({assigned.length})</h3>
            {ghosts > 0 && <p className="text-body-sm text-on-surface-variant">{ghostText(ghosts)}</p>}
            {!orderMatters && assigned.length > 1 && <p className="text-body-sm text-on-surface-variant">הסדר נקבע לפי הדירוג, ולכן אין כאן מה לסדר.</p>}
            <OrderedPluginList
              items={assigned}
              onChange={setAssigned}
              options={options}
              label={`התוספים בקטגוריה ${category.name}`}
              addLabel="הוסף תוסף לקטגוריה"
              emptyText="אין תוספים בקטגוריה."
              dividerAfter={form.sortMode === 'rating' ? top : 0}
              disabled={saving !== null}
              reorderable={orderMatters}
              surface="surface"
            />
          </section>
        )}

        {isEdit && (
          <section className="flex flex-col gap-2 border-t border-outline-variant pt-6">
            <ActionList label="מחיקה" items={[{ id: 'delete', icon: 'delete_forever', label: 'מחק קטגוריה', danger: true, disabled: saving !== null, onSelect: remove }]} />
            <p className="px-3 text-body-sm text-on-surface-variant">התוספים עצמם לא נמחקים — רק יוצאים מהקטגוריה.</p>
          </section>
        )}
      </div>
    </Drawer>
  )
}
