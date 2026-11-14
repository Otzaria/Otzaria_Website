'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorToast } from '@/components/admin/list/adminRequest'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { createSerialQueue } from '@/lib/adminUsersScreen/serialQueue'
import { TEAMS, displayName, flagBody, flagPatch, teamPendingText, teamToast } from '@/lib/adminUsersScreen/userTerms'
import { deleteUser, isUserGone, setCorrectionsVolunteer, updateUser } from './usersApi'

const FAILED = 'לא הצלחנו לעדכן את הצוות.'
const keyOf = (userId, team) => `${userId}:${team.id}`

/** המשתמש כבר לא קיים (נמחק בתור לפני שהבקשה יצאה) — הבקשה לא נשלחת. error.gone === true */
class Gone extends Error {
  gone = true
}

/**
 * כל הכתיבות של "משתמשים" — ברמת המסך, לא בתוך המגירה, כדי שישרדו את סגירתה:
 *
 * תור אחד (createSerialQueue): "שמור", מתג, מחיקה — אחת אחרי השנייה. כל בקשה נבנית רק כשהיא יוצאת, מהמשתמש
 * השמור העדכני (data.get) — ולכן מתג שיוצא אחרי שמירת תפקיד לא מחזיר את התפקיד הישן (ה-PUT כותב תמיד את
 * השם, התפקיד והנקודות מהגוף).
 *
 * מתגים (מפקח, מתנדב תיקונים, חסום מעריכה) — "בטל" לפני שליחה (useDeferredActions): הערך משתנה מיד במסך,
 * והבקשה יוצאת אחרי כמה שניות. לחיצה נוספת בזמן הזה — "בטל". מהמגירה (inline) ה"בטל" מוצג ליד המתג עצמו;
 * מהתפריט ⋮ בשורה — בהודעה קופצת. flushUser — שולח מיד (סגירת המגירה); cancelUser — מבטל (מחיקה).
 *
 * @param {{ data: ReturnType<typeof import('./useUsersData').useUsersData>, toast: any,
 *   onGone: (user: any) => void }} options  onGone — השרת אמר שהמשתמש לא קיים (404)
 */
export function useUserWrites({ data, toast, onGone }) {
  const [queue] = useState(createSerialQueue)
  const gone = useRef(new Set())
  // הפונקציות של useDeferredActions יציבות (האובייקט עצמו מתחלף עם pending) — כך flushUser יציב, ו-effect
  // שתלוי בו (סגירת המגירה) לא רץ בכל לחיצה
  const { schedule, cancel, flush, pending } = useDeferredActions()
  const [chosen, setChosen] = useState({}) // key → הערך שנבחר ועוד לא נשמר
  const [sending, setSending] = useState(() => new Set())
  const toastIds = useRef(new Map())
  const latest = useRef({ data, toast, onGone })
  useEffect(() => { latest.current = { data, toast, onGone } })

  const run = useCallback((task) => queue.run(task), [queue])

  /** המשתמש השמור העדכני — או Gone, אם נמחק בינתיים */
  const current = useCallback((id) => {
    const u = gone.current.has(id) ? null : latest.current.data.get(id)
    if (!u) throw new Gone()
    return u
  }, [])

  const forget = useCallback((key) => {
    setChosen((c) => {
      if (!(key in c)) return c
      const next = { ...c }
      delete next[key]
      return next
    })
  }, [])

  const send = useCallback(async (userId, team, next, key) => {
    const { toast: t } = latest.current
    const toastId = toastIds.current.get(key)
    toastIds.current.delete(key)
    setSending((s) => new Set(s).add(key))
    let user = null
    try {
      const server = await run(async () => {
        user = current(userId)
        if (team.via === 'volunteers') {
          await setCorrectionsVolunteer(userId, next)
          return null
        }
        const res = await updateUser(flagBody(user, team.field, next), { fallback: FAILED })
        return res?.user
      })
      latest.current.data.patch(flagPatch(userId, team, next, server))
      t.show({ id: toastId, message: teamToast(team, next, displayName(user)) })
    } catch (error) {
      if (error instanceof Gone) {
        if (toastId !== undefined) t.dismiss(toastId)
      } else if (isUserGone(error) && user) {
        if (toastId !== undefined) t.dismiss(toastId)
        latest.current.onGone(user)
      } else {
        t.show({ id: toastId, ...errorToast(error, FAILED) })
      }
    } finally {
      forget(key)
      setSending((s) => {
        const copy = new Set(s)
        copy.delete(key)
        return copy
      })
    }
  }, [run, current, forget])

  /**
   * סגירת הדף בזמן ההמתנה ל"בטל" — אותה בקשה כמו send, ב-keepalive (בלי לחכות לתשובה). רק כשאין בקשה אחרת באוויר:
   * הגוף של מתג נבנה מהמשתמש השמור, ובזמן ששמירה אחרת רצה הוא עלול להיות ישן (ולהחזיר תפקיד שרק עכשיו שונה).
   */
  const sendOnExit = useCallback((userId, team, next) => {
    if (!queue.idle()) return undefined
    let user
    try {
      user = current(userId)
    } catch {
      return undefined // נמחק בינתיים
    }
    return team.via === 'volunteers'
      ? setCorrectionsVolunteer(userId, next, { keepalive: true })
      : updateUser(flagBody(user, team.field, next), { fallback: FAILED, keepalive: true })
  }, [queue, current])

  /** "בטל" (בהודעה, ליד המתג, או לחיצה חוזרת) — חזרה למה שהיה, בלי בקשה */
  const undo = useCallback((user, team) => {
    const key = keyOf(user._id, team)
    if (!cancel(key)) return false
    forget(key)
    const id = toastIds.current.get(key)
    toastIds.current.delete(key)
    if (id !== undefined) latest.current.toast.show({ id, tone: 'info', message: 'השינוי בוטל' })
    return true
  }, [cancel, forget])

  const value = useCallback((user, team) => {
    const key = keyOf(user._id, team)
    return key in chosen ? chosen[key] : user?.[team.field] === true
  }, [chosen])

  /**
   * @param {any} user  @param {(typeof TEAMS)[number]} team  @param {boolean} next
   * @param {{ inline?: boolean }} [options]  inline — מהמגירה: "בטל" ליד המתג, בלי הודעה קופצת
   */
  const toggle = useCallback((user, team, next, { inline = false } = {}) => {
    const key = keyOf(user._id, team)
    if (sending.has(key) || undo(user, team)) return
    setChosen((c) => ({ ...c, [key]: next }))
    if (!inline) {
      const id = latest.current.toast.show({
        tone: 'info',
        message: teamPendingText(team, next, displayName(user)),
        action: { label: 'בטל', undo: true, onClick: () => undo(user, team) },
      })
      toastIds.current.set(key, id)
    }
    schedule(key, () => send(user._id, team, next, key), { onExit: () => sendOnExit(user._id, team, next) })
  }, [sending, undo, schedule, send, sendOnExit])

  const flushUser = useCallback((userId) => {
    for (const team of TEAMS) flush(keyOf(userId, team))
  }, [flush])

  const cancelUser = useCallback((userId) => {
    for (const team of TEAMS) {
      const key = keyOf(userId, team)
      if (!cancel(key)) continue
      forget(key)
      const id = toastIds.current.get(key)
      toastIds.current.delete(key)
      if (id !== undefined) latest.current.toast.dismiss(id)
    }
  }, [cancel, forget])

  /** מחיקה בתור: אחריה, בקשה שעוד ממתינה בתור על אותו משתמש לא יוצאת */
  const remove = useCallback((user) => run(async () => {
    await deleteUser(user._id)
    gone.current.add(user._id)
  }), [run])

  const teams = useMemo(() => ({
    value,
    toggle,
    undo,
    waiting: (user, team) => pending.has(keyOf(user._id, team)),
    sending: (user, team) => sending.has(keyOf(user._id, team)),
    /** המשתמש כמו שהוא נראה עכשיו — עם מה שנבחר ועוד ממתין (לשורה: הצ'יפים, והתפריט) */
    shown: (user) => {
      let out = user
      for (const team of TEAMS) {
        const key = keyOf(user._id, team)
        if (key in chosen && chosen[key] !== (user[team.field] === true)) out = { ...out, [team.field]: chosen[key] }
      }
      return out
    },
  }), [value, toggle, undo, pending, sending, chosen])

  return { run, current, teams, flushUser, cancelUser, remove }
}
