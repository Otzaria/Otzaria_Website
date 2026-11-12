'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  detailsBody, detailsChanges, detailsForm, detailsPatch, displayName, hasChanges, roleChangeConfirm, savedToast, validateDetails,
} from '@/lib/adminUsersScreen/userTerms'
import RoleChangeBody from './RoleChangeBody'
import { isUserGone, updateUser } from './usersApi'

/** חלון האישור של שינוי דואר — מה השרת עושה בפועל (api/admin/users, PUT) */
const EMAIL_CONFIRM = {
  title: 'לשנות את כתובת הדואר?',
  body: 'הכתובת החדשה תסומן כלא מאומתת, והמשתמש יצטרך לאמת אותה. גם קבלת התזכורות שלו תכובה.',
  confirmLabel: 'שנה כתובת',
}

const FAILED = 'לא הצלחנו לשמור את השינויים.'

/**
 * הטופס של "פרטים" ו"תפקיד" במגירה: הטיוטה, מה השתנה, השגיאות והשמירה (PUT /api/admin/users).
 *
 * לפני שמירה: שינוי תפקיד — חלון שאומר מה התפקיד החדש יראה ומה ייעלם (RoleChangeBody); שינוי דואר — חלון שאומר
 * שהכתובת תסומן כלא מאומתת. רק השדות ששונו נבדקים, ורק הם נלקחים מהטופס: השאר נשלחים כמו שהם שמורים.
 *
 * השמירה עוברת בתור של המסך (writes.run), והגוף נבנה כשהיא יוצאת — מהמשתמש העדכני. סגירת המגירה בזמן
 * "שומר…" לא עוצרת את השמירה: התוצאה מגיעה בהודעה קופצת (כשל — עם "פתח שוב"). כשל כשהמגירה פתוחה —
 * בתוך המגירה, והטיוטה נשמרת. משתמש שכבר לא קיים (404) — onGone.
 *
 * @param {{ user: any, self: boolean, confirm: Function, toast: any, writes: ReturnType<typeof import('./useUserWrites').useUserWrites>,
 *   onSaved: (patch: any) => void, onGone: (user: any) => void, onReopen?: (user: any) => void }} options
 */
export function useUserDetails({ user, self, confirm, toast, writes, onSaved, onGone, onReopen }) {
  const [form, setForm] = useState(() => detailsForm(user))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null) // { message, sessionExpired }
  const [saving, setSaving] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const changes = detailsChanges(user, form)
  const dirty = hasChanges(changes)

  const change = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
    setSaveError(null)
  }, [])

  const reset = useCallback(() => {
    setForm(detailsForm(user))
    setErrors({})
    setSaveError(null)
  }, [user])

  const save = useCallback(async () => {
    if (!dirty || saving) return false
    const found = validateDetails(form, changes)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return false
    }
    if (changes.role) {
      const c = roleChangeConfirm({ user, role: form.role, self })
      if (!(await confirm({ title: c.title, body: <RoleChangeBody confirm={c} />, confirmLabel: c.confirmLabel, tone: c.tone }))) return false
    }
    if (changes.email && !(await confirm(EMAIL_CONFIRM))) return false
    const submitted = { form, changes }
    setSaving(true)
    setSaveError(null)
    try {
      const { body, res } = await writes.run(async () => {
        const b = detailsBody(writes.current(user._id), submitted.form, submitted.changes)
        return { body: b, res: await updateUser(b, { emailChanged: submitted.changes.email }) }
      })
      const patch = detailsPatch(body, submitted.changes, res?.user)
      onSaved(patch)
      const name = displayName({ ...user, ...patch })
      toast.show({ message: savedToast(name, submitted.changes, body.role) })
      if (alive.current) setForm(detailsForm({ ...user, ...patch }))
      return true
    } catch (error) {
      if (error?.gone) return false // נמחק כאן, בתור, לפני שהשמירה יצאה
      if (isUserGone(error)) {
        onGone(user)
        return false
      }
      const message = error?.message || FAILED
      if (alive.current) {
        setSaveError({ message, sessionExpired: Boolean(error?.sessionExpired) })
      } else {
        // המגירה כבר נסגרה — ההודעה במקומה
        toast.show({
          tone: 'error',
          message: `השינויים של ${displayName(user)} לא נשמרו. ${message}`,
          action: onReopen ? { label: 'פתח שוב', onClick: () => onReopen(user) } : undefined,
        })
      }
      return false
    } finally {
      if (alive.current) setSaving(false)
    }
  }, [dirty, saving, form, changes, user, self, confirm, writes, onSaved, onGone, onReopen, toast])

  return { form, change, errors, saveError, saving, dirty, changes, save, reset }
}
