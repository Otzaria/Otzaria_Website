'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HEARTBEAT_MS } from '@/lib/trainingProof/vocab'
import { tpFetch, beacon } from './tpApi'
import { applySaved } from './roundModel'

// הסבב של 30 בדפדפן (docs/76 §8.2), משותף לזיהוי ולנתב:
// * בכניסה — הסבב הנוכחי אם יש בו שורות פתוחות, אחרת סבב חדש (POST).
// * "דופק" כל 60 שניות (וגם כשהלשונית חוזרת להיות גלויה). אם השרת עונה שאין עוד שורות
//   פתוחות אצלנו בזמן שעל המסך יש — הן עברו לאחר (lost), והדף מציע סבב חדש.
// * יציאה מהדף (pagehide) — שחרור מיידי של מה שלא סומן (sendBeacon).
// * mark — כל סימון נשמר מיד בבקשה משלו; עד שהשרת עונה הפריט מסומן saving.
//
// status: loading | ready | empty | noaccess | error

const LOADING = { status: 'loading', items: [], round: null, access: null, error: '' }

const adopted = (data) => ({ status: data.items.length ? 'ready' : 'empty', items: data.items, round: data.round, access: null, error: '' })

const failedState = (r) =>
  r.status === 403
    ? { ...LOADING, status: 'noaccess', access: r.data.access || 'none' }
    : { ...LOADING, status: 'error', error: r.data.error || 'הטעינה נכשלה — נסו שוב' }

const takeNew = (section) => tpFetch('/api/training-proof/round', { method: 'POST', body: { section } })

// טעינה אחת בכל רגע לכל חלק: טעינה כפולה (React מריץ effect פעמיים בפיתוח, רינדור כפול)
// אינה שולחת שתי בקשות "סבב חדש" — השנייה מקבלת את אותה תשובה
const inflight = new Map()
function loadOnce(section) {
  if (!inflight.has(section)) {
    const p = tpFetch(`/api/training-proof/round?section=${section}`)
      .then((r) => (r.ok && r.data.open === 0 ? takeNew(section) : r))
      .finally(() => inflight.delete(section))
    inflight.set(section, p)
  }
  return inflight.get(section)
}

export function useRound(section) {
  const [state, setState] = useState(LOADING)
  const [lost, setLost] = useState(false)
  const [saving, setSaving] = useState({})
  const [nonce, setNonce] = useState(0)
  const itemsRef = useRef([])

  useEffect(() => {
    itemsRef.current = state.items
  }, [state.items])

  // טעינה: הסבב הנוכחי אם יש בו שורות פתוחות, אחרת סבב חדש
  useEffect(() => {
    let cancelled = false
    loadOnce(section).then((r) => {
        if (cancelled) return
        setLost(false)
        setState(r.ok ? adopted(r.data) : failedState(r))
      })
    return () => {
      cancelled = true
    }
  }, [section, nonce])

  const reload = useCallback(() => {
    setState(LOADING)
    setNonce((n) => n + 1)
  }, [])

  // "קח 30 נוספות" / "קח סבב חדש"
  const take = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    const r = await takeNew(section)
    setLost(false)
    setState(r.ok ? adopted(r.data) : failedState(r))
  }, [section])

  // הדופק
  useEffect(() => {
    if (state.status !== 'ready') return undefined
    const beat = async () => {
      const r = await tpFetch('/api/training-proof/round/heartbeat', { method: 'POST', body: { section } })
      const openHere = itemsRef.current.filter((it) => it.status === 'held' && !it.skipped).length
      if (!r.ok) return
      if (r.data.open === 0 && openHere) setLost(true)
      // בשרת יש יותר שורות פתוחות ממה שעל המסך (סבב שנלקח גם בלשונית אחרת) — טוענים את הסבב מחדש
      else if (r.data.open > openHere) {
        const cur = await tpFetch(`/api/training-proof/round?section=${section}`)
        if (cur.ok) setState((s) => ({ ...s, ...adopted(cur.data) }))
      }
    }
    const t = setInterval(beat, HEARTBEAT_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [state.status, section])

  // יציאה מהדף — שחרור מיידי
  useEffect(() => {
    const onHide = () => beacon('/api/training-proof/round/release', { section })
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [section])

  // "סיום להיום" / "לדף הבית" — שחרור לפני המעבר
  const release = useCallback(() => tpFetch('/api/training-proof/round/release', { method: 'POST', body: { section } }), [section])

  // סימון. מחזיר {ok, error?, skipped?}
  const mark = useCallback(async (id, body) => {
    setSaving((s) => ({ ...s, [id]: true }))
    const r = await tpFetch(`/api/training-proof/items/${id}/mark`, { method: 'POST', body })
    setSaving((s) => {
      const n = { ...s }
      delete n[id]
      return n
    })
    if (!r.ok || !(r.data.item || r.data.skipped)) {
      if (r.status === 409) setLost(true)
      return { ok: false, error: r.data.error || 'השמירה נכשלה — נסו שוב' }
    }
    setState((s) => ({ ...s, items: applySaved(s.items, id, r.data) }))
    return { ok: true, skipped: r.data.skipped }
  }, [])

  return { ...state, lost, saving, take, mark, release, reload }
}
