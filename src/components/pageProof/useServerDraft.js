'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DRAFT_IDLE_MS, DRAFT_RETRY_MS, DRAFT_SAVE_MS, KEEPALIVE_MAX, baseKeysOf, draftPayload, writeDraftMeta } from '@/lib/pageProof/draftRules'

// שמירת הטיוטה בשרת מדף המתנדב (docs/63 §2; השרת — PUT /api/page-proof/pages/[id]/draft). העורך כבר שומר כל שינוי
// בדפדפן מיד (useProofEditor — המטמון המהיר); כאן — העותק שבשרת, שעובר מחשב ועובר מתנדב:
//   • onOps(allOps) — מ-ProofEditor onOpsChange: הרשימה נשמרת (בלי רינדור), ושמירה נקבעת DRAFT_IDLE_MS אחרי השינוי
//     האחרון, ולכל היותר אחת לכל DRAFT_SAVE_MS;
//   • setStage(stage) — השלב נשמר בטיוטה, מיד;
//   • flush() — עכשיו (לפני הגשה, שליחה לזיהוי-מחדש, מעבר-עמוד); reset() — "התחל מאפס" (גם מה שהתקבל ממתנדב קודם);
//   • הלשונית מוסתרת — שמירה רגילה (הדף עדיין חי); יציאה מהדף (pagehide) ובסגירת העורך — שמירה אחרונה בבקשת
//     keepalive, רק כשהגוף קטן מ-KEEPALIVE_MAX (דפדפנים דוחים keepalive מעל 64KiB); גדולה יותר — בקשה רגילה, והעותק
//     המקומי (שנשמר בכל שינוי) הוא הגיבוי.
// הבקשות בתור אחד: כל שמירה (גם "התחל מאפס", גם שינוי-שלב) יוצאת אחרי שהקודמת חזרה, עם התוכן העדכני באותו רגע — כך
// ההבטחה של flush()/setStage() מתקיימת רק אחרי שמה שהיה בעורך באותו רגע נשמר (למשל לפני שליחה לזיהוי-מחדש).
// כל שמירה נושאת baseUpdatedAt — מתי נשמרה הטיוטה בשרת כפי שראינו אותה לאחרונה; השתנתה בינתיים (לשונית או מחשב אחר)
// ← 409 'stale': מפסיקים לשמור, והמשתמש טוען את העמוד מחדש (החדשה מבין המקומית לזו שבשרת נכנסת לעורך).
// לא נשלח מה שזהה למה שכבר בשרת (השוואת התוכן). שמירה שנכשלה (רשת, שרת, האטה) — שוב אחרי DRAFT_RETRY_MS, והמקומית
// נשארת; 403 (העמוד כבר אינו בטיפולכם) או 409 (העמוד הוחלף / הטיוטה השתנתה) — מפסיקים לשמור עד שהעמוד נטען מחדש.
// status.state: 'idle' (אין מה לשמור) · 'pending' · 'saving' · 'saved' · 'error' · 'lost' (403) · 'reload' (409 —
// העמוד הוחלף) · 'stale' (409 — הטיוטה נשמרה בינתיים במקום אחר)

const sameStatus = (a, b) => a.state === b.state && a.at === b.at && a.error === b.error

function createEngine(cfg, setStatus) {
  const st = {
    cfg,
    ops: null,
    stage: cfg.stage ?? null,
    sentPayload: JSON.stringify(draftPayload(cfg.initial?.ops || [])),
    sentStage: cfg.stage ?? null,
    // updatedAt של הטיוטה בשרת כפי שראינו אותה לאחרונה (null — אין שם טיוטה)
    srv: cfg.initial?.srv ?? null,
    // "התחל מאפס" שעוד לא אושר בשרת — גם שמירת-היציאה מאפסת
    resetPending: false,
    busy: false,
    timer: 0,
    last: 0,
    chain: Promise.resolve(true),
    stopped: false,
    gone: false,
  }
  const status = (next) => {
    if (!st.gone) setStatus(next)
  }
  const clear = () => {
    if (st.timer) clearTimeout(st.timer)
    st.timer = 0
  }
  const schedule = (idle = DRAFT_IDLE_MS) => {
    if (!st.cfg.enabled || st.stopped || st.gone) return
    clear()
    st.timer = setTimeout(() => {
      st.timer = 0
      send()
    }, Math.max(idle, DRAFT_SAVE_MS - (Date.now() - st.last)))
  }
  // הבקשה עצמה, עם התוכן העדכני ברגע היציאה. ← Promise<boolean> (נשמר / אין מה לשמור)
  const put = async ({ keepalive = false, reset = false } = {}) => {
    const { enabled, pageId, revision, draftKey } = st.cfg
    if (!enabled || st.stopped || !pageId) return false
    const doReset = reset || st.resetPending
    const ops = doReset ? [] : draftPayload(st.ops || [])
    const payload = JSON.stringify(ops)
    if (!doReset && (st.ops === null || payload === st.sentPayload) && st.stage === st.sentStage) return true
    const stageNow = st.stage
    const body = JSON.stringify({ revision, ops, stage: stageNow, baseUpdatedAt: st.srv, ...(doReset ? { reset: true } : {}) })
    st.last = Date.now()
    status({ state: 'saving', at: null, error: null })
    let retry = false
    st.busy = true
    try {
      const res = await fetch(`/api/page-proof/pages/${pageId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: keepalive && body.length <= KEEPALIVE_MAX,
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        st.sentPayload = payload
        st.sentStage = stageNow
        st.srv = data.updatedAt || st.srv
        if (doReset) st.resetPending = false
        try {
          // base — הגרסה המסונכרנת עכשיו: הבסיס למיזוג המשולש אם תיפתח עבודה מקבילה (draftRules.diffDrafts)
          writeDraftMeta(window.localStorage, pageId, { key: draftKey, srv: data.updatedAt, stage: stageNow, stale: false, base: baseKeysOf(ops) })
        } catch {
          /* אחסון חסום */
        }
        status({ state: 'saved', at: data.updatedAt || null, error: null })
        return true
      }
      if (res.status === 403 || res.status === 409) {
        st.stopped = true
        const state = res.status === 403 ? 'lost' : data?.code === 'stale' ? 'stale' : 'reload'
        // בפתיחה הבאה: לא לבחור לפי שעון — לאחד עם מה שבשרת, או לשאול (draftRules.applyServerDraft)
        if (state === 'stale') {
          try {
            writeDraftMeta(window.localStorage, pageId, { key: draftKey, stale: true })
          } catch {
            /* אחסון חסום */
          }
        }
        status({ state, at: null, error: data?.error || null })
        return false
      }
      status({ state: 'error', at: null, error: data?.error || `שגיאת שרת (${res.status})` })
      retry = true
      return false
    } catch {
      status({ state: 'error', at: null, error: 'אין חיבור לאתר' })
      retry = true
      return false
    } finally {
      st.busy = false
      if (retry && !keepalive) schedule(DRAFT_RETRY_MS)
    }
  }
  // בתור: אחרי שהבקשה הקודמת חזרה
  const send = (opts = {}) => {
    if (!st.cfg.enabled || st.stopped || !st.cfg.pageId) return Promise.resolve(false)
    clear()
    const run = st.chain.then(() => put(opts))
    st.chain = run.catch(() => false)
    return run
  }
  return {
    onOps(all) {
      const first = st.ops === null
      st.ops = Array.isArray(all) ? all : []
      if (!st.cfg.enabled || st.stopped) return
      // הרינדור הראשון של העורך מדווח את מה שנטען — יוצא רק אם הוא שונה ממה שבשרת (טיוטה מקומית חדשה יותר)
      if (first && JSON.stringify(draftPayload(st.ops)) === st.sentPayload) return
      status({ state: 'pending', at: null, error: null })
      schedule()
    },
    setStage(next) {
      st.stage = next
      return send()
    },
    flush: (opts) => send(opts),
    reset() {
      st.ops = []
      st.resetPending = true
      return send({ reset: true })
    },
    // hidden — הלשונית מוסתרת (הדף חי: שמירה רגילה בתור); אחרת — יציאה מהדף/סגירת העורך: מיד, keepalive כשקטן
    leave(hidden = false) {
      if (!(st.timer || st.ops !== null || st.resetPending)) return
      if (hidden === true) {
        send()
        return
      }
      // בקשה בדרך — אחריה (אחרת שתיהן יוצאות על אותו בסיס, והשנייה נדחית כ-stale); אחרת — מיד
      if (st.busy) send({ keepalive: true })
      else {
        clear()
        put({ keepalive: true })
      }
    },
    configure(patch) {
      st.cfg = { ...st.cfg, ...patch }
    },
    mount() {
      st.gone = false
    },
    dispose() {
      clear()
      st.gone = true
    },
  }
}

export function useServerDraft({ pageId, revision, draftKey, enabled = true, stage = null, initial = null }) {
  const [status, setStatusRaw] = useState(() => ({ state: initial?.srv ? 'saved' : 'idle', at: initial?.srv || null, error: null }))
  // מנוע אחד לכל מופע (useState — לא ref: הפונקציות שלו יציבות ומותר לגשת אליהן ברינדור)
  const [eng] = useState(() =>
    createEngine({ pageId, revision, draftKey, enabled, stage, initial }, (next) => setStatusRaw((cur) => (sameStatus(cur, next) ? cur : next)))
  )
  // ההגדרות העדכניות (העורך מקבל key לפי העמוד והגרסה — בפועל הן קבועות לכל מופע)
  useLayoutEffect(() => {
    eng.configure({ pageId, revision, draftKey, enabled })
  }, [eng, pageId, revision, draftKey, enabled])

  useEffect(() => {
    if (!enabled) return undefined
    eng.mount()
    const onVis = () => {
      if (document.visibilityState === 'hidden') eng.leave(true)
    }
    const onHide = () => eng.leave()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVis)
      eng.leave()
      eng.dispose()
    }
  }, [eng, enabled])

  return useMemo(() => ({ status, onOps: eng.onOps, setStage: eng.setStage, flush: eng.flush, reset: eng.reset }), [status, eng])
}
