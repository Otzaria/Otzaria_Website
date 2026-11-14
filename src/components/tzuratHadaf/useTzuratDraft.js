'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

// שמירת הטיוטה של בדיקת עמוד בשרת (PUT /api/tzurat-hadaf/pages/[id]/draft {stage, state, baseUpdatedAt}) — בדרך של
// useServerDraft בהגהת העמודים, מותאם ומצומצם: update(stage, state) אחרי כל שינוי; השמירה יוצאת לכל המוקדם DRAFT_MS
// אחרי השינוי הראשון שלא נשמר (כך גם עבודה רצופה נשמרת כל כמה שניות), בתור אחד (בקשה אחרי בקשה), עם התוכן העדכני.
// כל שמירה נושאת baseUpdatedAt — הטיוטה כפי שראינו אותה; השתנתה בינתיים במקום אחר ← 409 'stale'; העמוד כבר אינו
// בידיכם ← 409 'not_holder' (או 403): מפסיקים לשמור. כישלון אחר (רשת, שרת) — ניסיון חוזר אחרי DRAFT_RETRY_MS.
// יציאה מהדף (pagehide) — שמירה אחרונה ב-keepalive. status.state: idle · pending · saving · saved · error · stale · lost.

export const DRAFT_MS = 5000
export const DRAFT_RETRY_MS = 15000
const KEEPALIVE_MAX = 60000

export function createDraftEngine({ pageId, version, baseUpdatedAt = null, enabled = true, onStatus = () => {}, save = api.saveDraft }) {
  const st = { srv: baseUpdatedAt, pending: null, pendingJson: null, sentJson: null, timer: 0, chain: Promise.resolve(true), stopped: false, enabled }
  const status = (s) => onStatus(s)
  const clear = () => {
    if (st.timer) clearTimeout(st.timer)
    st.timer = 0
  }
  const put = async ({ keepalive = false } = {}) => {
    if (!st.enabled || st.stopped || !st.pending) return true
    const json = st.pendingJson
    if (json === st.sentJson) {
      st.pending = null
      return true
    }
    const body = { ...st.pending, version, baseUpdatedAt: st.srv }
    status({ state: 'saving' })
    const r = await save(pageId, body, { keepalive: keepalive && json.length < KEEPALIVE_MAX })
    if (r.ok) {
      st.srv = r.data?.updatedAt || st.srv
      st.sentJson = json
      if (st.pendingJson === json) st.pending = null
      status({ state: st.pending ? 'pending' : 'saved', at: st.srv })
      if (st.pending) schedule()
      return true
    }
    if (r.status === 409 || r.status === 403) {
      st.stopped = true
      clear()
      const state = r.code === 'stale' ? 'stale' : 'lost'
      status({ state, error: r.error })
      return false
    }
    status({ state: 'error', error: r.error })
    if (!keepalive) schedule(DRAFT_RETRY_MS)
    return false
  }
  const send = (opts) => {
    clear()
    const run = st.chain.then(() => put(opts))
    st.chain = run.catch(() => false)
    return run
  }
  function schedule(ms = DRAFT_MS) {
    if (!st.enabled || st.stopped || st.timer) return
    st.timer = setTimeout(() => {
      st.timer = 0
      send()
    }, ms)
  }
  return {
    update(stage, state) {
      if (!st.enabled || st.stopped) return
      const json = JSON.stringify({ stage, state })
      if (json === (st.pendingJson ?? st.sentJson)) return
      st.pending = { stage, state }
      st.pendingJson = json
      if (json === st.sentJson) {
        st.pending = null
        return
      }
      status({ state: 'pending' })
      schedule()
    },
    /** הטיוטה הראשונה שנטענה מהשרת — לא לשלוח אותה שוב */
    seed(stage, state) {
      st.sentJson = JSON.stringify({ stage, state })
      st.pendingJson = st.sentJson
    },
    flush: () => send(),
    leave() {
      if (st.pending && !st.stopped) {
        clear()
        put({ keepalive: true })
      }
    },
    dirty: () => !!st.pending && !st.stopped,
    setEnabled(v) {
      st.enabled = v
      if (!v) clear()
    },
    dispose: clear,
  }
}

export function useTzuratDraft({ pageId, version, baseUpdatedAt = null, enabled = true }) {
  const [status, setStatus] = useState(() => ({ state: baseUpdatedAt ? 'saved' : 'idle', at: baseUpdatedAt }))
  const [eng] = useState(() => createDraftEngine({ pageId, version, baseUpdatedAt, enabled, onStatus: setStatus }))

  useEffect(() => {
    eng.setEnabled(enabled)
  }, [eng, enabled])

  useEffect(() => {
    const onHide = () => eng.leave()
    // יציאה עם שינויים שלא נשמרו — הדפדפן שואל
    const onBefore = (e) => {
      if (!eng.dirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onBefore)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('beforeunload', onBefore)
      eng.leave()
      eng.dispose()
    }
  }, [eng])

  return useMemo(() => ({ status, update: eng.update, seed: eng.seed, flush: eng.flush, dirty: eng.dirty }), [status, eng])
}
