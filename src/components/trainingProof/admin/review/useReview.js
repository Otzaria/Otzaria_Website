'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsk } from '../useAsk'
import { getJson, sendJson, fmt } from '../api'

// הרשימה, הבחירה והפעולות המשותפות לסקירת הזיהוי ולסקירת הנתב.
// query — הפרמטרים של /review (בלי page); onChanged — רענון המונים בראש המסך.
export function useReview(query, onChanged) {
  const { showAlert, ask } = useAsk()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const key = JSON.stringify(query)
  // העמוד שייך למסנן: מסנן חדש — חוזרים לעמוד הראשון
  const [paging, setPaging] = useState({ key, page: 1 })
  const page = paging.key === key ? paging.page : 1
  const setPage = useCallback((p) => setPaging({ key, page: p }), [key])
  const seq = useRef(0)

  const load = useCallback(async () => {
    const my = ++seq.current
    try {
      const qs = new URLSearchParams(Object.entries({ ...JSON.parse(key), page: String(page) }).filter(([, v]) => v !== null && v !== '' && v !== false))
      const d = await getJson(`/review?${qs}`)
      if (my === seq.current) setData(d)
    } catch (e) {
      if (my === seq.current) setData({ items: [], total: 0, page: 1, pages: 1, stats: null, error: e.message })
    }
  }, [key, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- רשימה חדשה מהשרת: הבחירה הקודמת מתאפסת
    setSel(new Set())
    load()
  }, [load])

  const after = useCallback(async () => {
    setSel(new Set())
    await load()
    onChanged?.()
  }, [load, onChanged])

  const run = useCallback(
    async (fn) => {
      setBusy(true)
      try {
        return await fn()
      } catch (e) {
        showAlert('שגיאה', e.message)
        return null
      } finally {
        setBusy(false)
      }
    },
    [showAlert]
  )

  const section = query.section
  const decide = (ids, decision) => run(async () => {
    const r = await sendJson('/review/decide', { section, ids, decision })
    await after()
    return r
  })

  const toggle = (id) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // אישור/דחייה של המסומנות — תמיד עם חלון-אישור בדף
  const decideSelected = async (decision, unit = 'שורות') => {
    const ids = [...sel]
    if (!ids.length) return
    const yes = await ask(
      decision === 'approve' ? `לאשר ${fmt(ids.length)} ${unit}?` : `לדחות ${fmt(ids.length)} ${unit}?`,
      decision === 'approve'
        ? 'הן ייכנסו לקובץ הבא שתורידו לתחנה, כמאושרות.'
        : 'הן יחזרו למאגר, ומתנדב אחר יקבל אותן. אותו מתנדב לא יקבל אותן שוב.',
      decision === 'approve' ? 'אשר' : 'דחה'
    )
    if (yes) {
      const r = await decide(ids, decision)
      if (r) showAlert(decision === 'approve' ? 'אושר' : 'נדחה', `${fmt(r.count)} ${unit}`)
    }
  }

  // אישור גורף על כל התור: קודם סופרים בשרת, ואז חלון-אישור עם המספר האמיתי
  const bulk = async (kind, extra, { title, message, unit = 'שורות' }) => {
    const dry = await run(() => sendJson('/review/bulk', { section, kind, ...extra, dry: true }))
    if (!dry) return
    if (!dry.count) return showAlert('אין מה לאשר', 'אין כרגע פריטים שמתאימים לאישור הזה')
    const yes = await ask(title(dry.count), message, 'אשר הכול')
    if (!yes) return
    const r = await run(async () => {
      const x = await sendJson('/review/bulk', { section, kind, ...extra })
      await after()
      return x
    })
    if (r) showAlert('אושר', `${fmt(r.count)} ${unit}`)
  }

  const fix = (item, mark) =>
    run(async () => {
      const r = await sendJson('/review/fix', { id: item.id, mark })
      await after()
      return r
    })

  return { data, page, setPage, busy, sel, setSel, toggle, decide, decideSelected, bulk, fix, reload: load, run }
}
