'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { submissionKind } from '@/lib/adminPlugins/pluginsQuery'
import {
  approveUpdateConfirm, approvedMessage, bulkResultText, deleteForeverConfirm, deleteVersionConfirm, displayName, quoted, rejectConfirm,
  rejectedMessage, resumeOwnerConfirm, suspendMessage, suspendedByOwner, unapproveConfirm,
} from '@/lib/adminPlugins/pluginTerms'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { errorToast } from '@/components/admin/list/adminRequest'
import { refreshAdminBadgeCounts } from '@/components/admin/shell/useAdminBadgeCounts'
import * as api from './pluginsApi'

/**
 * הפעולות על תוספים — אחת לכל המסך (שורה, מגירה ופעולות מרובות). כל פעולה:
 *   הרסנית (דחה, מחק לצמיתות, מחק גרסה) — חלון אישור (tone="danger") שאומר מה השרת באמת ימחק, ואחריה הודעה.
 *   שאפשר להחזיר (השהה / החזר לחנות) — בלי שאלה; הודעה עם "בטל" (הפעולה ההפוכה). חריג: תוסף שהמפתח השהה
 *     בעצמו — "החזר לחנות" שואל ובלי "בטל", כי השהיה מהניהול הייתה נועלת אותו מחוץ לתוסף שלו.
 *   החזר להמתנה — חלון אישור (לא "בטל": אישור מחדש שולח למפתח מייל, ולכן הוא לא החזרה שקטה).
 * הרשימות מתעדכנות מקומית מיד, ואחר כך רענון שקט מהשרת (המונים, ומה שזז בין "לאישור" ל"בחנות"). פעולה
 * שמשנה את התור מרעננת גם את מונה "לאישור" שבסרגל.
 * פעולה מרובה (השהה, החזר לחנות, שבץ בקטגוריה): 4 בקשות במקביל (אין נקודת קצה מרובה; שיבוץ — אחת אחת),
 * bulkProgress + stopBulk ("X מתוך Y" ו"עצור"; יציאה מהמסך באמצע — עוצרת, useBulkRun), ובסוף הודעה אחת שאומרת כמה הצליחו, כמה לא ולמה. מחזירה את
 * מזהי מי שנכשל או לא נשלח (עצירה, תקלה בשרת), כדי שישארו מסומנים לניסיון נוסף. תוסף שהמפתח השהה — מדלגים עליו ואומרים.
 * busy — מזהי תוספים שיש עליהם בקשה פתוחה (הכפתורים שלהם מושבתים).
 *
 * @param {{ data: ReturnType<typeof import('./usePluginsData').usePluginsData>, toast: any, confirm: Function,
 *   openApprove: (plugin: any) => void, openEdit: (data: any) => void, onRemoved?: (id: string) => void }} options
 */
export function usePluginActions({ data, toast, confirm, openApprove, openEdit, onRemoved }) {
  const { busy, track } = useBusyIds()
  // יציאה מהמסך באמצע פעולה מרובה — לא נשלחות עוד בקשות
  const { run: runBulk, progress: bulkProgress, stopping, stop: stopBulk } = useBulkRun()
  const { setPending, setApproved, setCategories, refresh } = data
  // "בטל" של השהיה קורא לאותה פונקציה (ההפך) — דרך ref, כי ההודעה נוצרת בתוכה
  const suspendRef = useRef(null)

  const fail = useCallback((error, fallback) => { toast.show(errorToast(error, fallback)) }, [toast])

  /** הרצה על כמה תוספים: עצירה, התקדמות (כשיש יותר מאחד), ונעילת השורות */
  const runOn = useCallback((action, list, worker, { limit = 4 } = {}) => (
    track(list.map((p) => p._id), () => runBulk(list, worker, { meta: { action }, showProgress: list.length > 1, limit }))
  ), [track, runBulk])

  /**
   * ההודעה בסוף פעולה מרובה. ההרשאה אבדה — מה שהספיק להיעשות, והכפתור "התחבר"; תקלה בשרת (נעצר) — הסיכום הרגיל
   * ("נעצר: N לא עודכנו"), ואחריו הסיבה
   */
  const reportBulk = useCallback((action, run, { skipped = 0, category, undo } = {}) => {
    const done = run.done.length
    if (isAccessLost(run.fatal)) {
      const before = done > 0 ? `${bulkResultText(action, { done, category }).message} ` : ''
      toast.show({ ...errorToast(run.fatal), message: `${before}${run.fatal.message}` })
      return
    }
    const failedNames = run.failed.map((f) => displayName(f.item))
    const { message, tone } = bulkResultText(action, { done, failed: run.failed.length, stopped: run.notAttempted.length, skipped, failedNames, category })
    toast.show({
      message: run.fatal ? withStopReason(message, run.fatal) : message,
      tone: run.fatal ? 'error' : tone,
      action: done > 0 ? undo : undefined,
    })
  }, [toast])

  const performApprove = useCallback(async (plugin, selection) => {
    try {
      await track([plugin._id], () => api.approvePlugin(plugin._id, selection))
      setPending((list) => list.filter((p) => p._id !== plugin._id))
      onRemoved?.(plugin._id)
      toast.show({
        tone: 'success',
        message: approvedMessage(plugin),
        action: plugin.isSuspended === true ? { label: 'החזר לחנות', onClick: () => suspendRef.current?.([plugin], 'resume') } : undefined,
      })
      refresh()
      refreshAdminBadgeCounts()
      return true
    } catch (error) {
      fail(error, 'לא הצלחנו לאשר את התוסף.')
      return false
    }
  }, [track, setPending, onRemoved, toast, refresh, fail])

  const approve = useCallback(async (plugin) => {
    // תוסף בלי עדכון שממתין — חלון אישור עם שיבוץ לקטגוריות; עדכון — אישור פשוט
    if (!plugin.pendingUpdate) {
      openApprove(plugin)
      return
    }
    if (!(await confirm(approveUpdateConfirm(plugin)))) return
    await performApprove(plugin)
  }, [openApprove, confirm, performApprove])

  const reject = useCallback(async (plugin) => {
    if (!(await confirm(rejectConfirm(plugin)))) return
    try {
      await track([plugin._id], () => api.deletePlugin(plugin._id, 'לא הצלחנו לדחות את התוסף.'))
      const updateOnly = submissionKind(plugin) === 'update'
      setPending((list) => list.filter((p) => p._id !== plugin._id))
      if (updateOnly) setApproved((list) => list.map((p) => (p._id === plugin._id ? { ...p, pendingUpdate: null, pendingChangeSummary: [] } : p)))
      onRemoved?.(plugin._id, { stillInStore: updateOnly })
      toast.show({ message: rejectedMessage(plugin) })
      refresh()
      refreshAdminBadgeCounts()
    } catch (error) {
      fail(error, 'לא הצלחנו לדחות את התוסף.')
    }
  }, [confirm, track, setPending, setApproved, onRemoved, toast, refresh, fail])

  // השהה / החזר לחנות — לאחד או לכמה (bulk). "בטל" מריץ את ההפוך על מי שהצליח.
  const setSuspended = useCallback(async (plugins, action, { isUndo = false, bulk = false } = {}) => {
    const wanted = plugins.filter((p) => (action === 'suspend') !== (p.isSuspended === true))
    const skipped = bulk && action === 'resume' ? wanted.filter(suspendedByOwner) : []
    const list = wanted.filter((p) => !skipped.includes(p))
    if (list.length === 0) {
      if (bulk) toast.show({ tone: 'info', ...bulkResultText(action, { done: 0, skipped: skipped.length, unchanged: plugins.length }) })
      return []
    }
    const owner = !isUndo && !bulk && suspendedByOwner(list[0])
    if (owner && !(await confirm(resumeOwnerConfirm(list[0])))) return []
    const run = await runOn(action, list, async (plugin) => {
      const res = await api.pluginAction(plugin._id, action)
      const updated = res?.plugin || {}
      setApproved((all) => all.map((p) => (p._id === plugin._id
        ? { ...p, isSuspended: action === 'suspend', suspendedByRole: updated.suspendedByRole ?? (action === 'suspend' ? 'admin' : null) }
        : p)))
    })
    refresh()
    const back = action === 'suspend' ? 'resume' : 'suspend'
    const undo = isUndo || owner ? undefined : {
      label: 'בטל',
      undo: true,
      onClick: () => suspendRef.current?.(run.done.map((p) => ({ ...p, isSuspended: action === 'suspend' })), back, { isUndo: true }),
    }
    if (!bulk && list.length === 1) {
      if (run.failed.length > 0) fail(run.failed[0].error)
      else toast.show({ message: suspendMessage(action, run.done), action: undo })
    } else {
      reportBulk(action, run, { skipped: skipped.length, undo })
    }
    return [...run.failed.map((f) => f.item._id), ...run.notAttempted.map((p) => p._id)]
  }, [confirm, runOn, setApproved, refresh, fail, reportBulk, toast])
  useEffect(() => { suspendRef.current = setSuspended }, [setSuspended])

  // שבץ בקטגוריה — לכמה תוספים. אחת אחת: כל תשובה מחזירה את הקטגוריה כולה.
  const assign = useCallback(async (plugins, category) => {
    const already = new Set((category?.plugins || []).map((p) => p.id))
    const list = plugins.filter((p) => !already.has(p._id))
    if (list.length === 0) {
      toast.show({ tone: 'info', ...bulkResultText('assign', { done: 0, unchanged: plugins.length, category: category?.name }) })
      return []
    }
    let latest = null
    const run = await runOn('assign', list, async (plugin) => {
      const res = await api.toggleCategoryPlugin(category.id, plugin._id, true)
      latest = res.category || latest
    }, { limit: 1 })
    if (latest) setCategories((all) => (all || []).map((c) => (c.id === category.id ? latest : c)))
    reportBulk('assign', run, { category: category.name })
    return [...run.failed.map((f) => f.item._id), ...run.notAttempted.map((p) => p._id)]
  }, [runOn, setCategories, reportBulk, toast])

  const unapprove = useCallback(async (plugin) => {
    if (!(await confirm(unapproveConfirm(plugin)))) return
    try {
      await track([plugin._id], () => api.pluginAction(plugin._id, 'unapprove'))
      setApproved((list) => list.filter((p) => p._id !== plugin._id))
      onRemoved?.(plugin._id)
      toast.show({ message: `${quoted(plugin.name)} חזר לרשימה "לאישור"` })
      refresh()
      refreshAdminBadgeCounts()
    } catch (error) {
      fail(error, 'לא הצלחנו להחזיר את התוסף להמתנה.')
    }
  }, [confirm, track, setApproved, onRemoved, toast, refresh, fail])

  const deleteForever = useCallback(async (plugin) => {
    if (!(await confirm(deleteForeverConfirm(plugin)))) return
    try {
      await track([plugin._id], () => api.deletePlugin(plugin._id, 'לא הצלחנו למחוק את התוסף.'))
      setApproved((list) => list.filter((p) => p._id !== plugin._id))
      onRemoved?.(plugin._id)
      toast.show({ message: `${quoted(plugin.name)} נמחק לצמיתות` })
      refresh()
      refreshAdminBadgeCounts()
    } catch (error) {
      fail(error, 'לא הצלחנו למחוק את התוסף.')
    }
  }, [confirm, track, setApproved, onRemoved, toast, refresh, fail])

  const deleteVersion = useCallback(async (plugin, version) => {
    if (!(await confirm(deleteVersionConfirm(plugin, version)))) return
    try {
      await track([plugin._id], () => api.deleteVersion(plugin._id, version))
      const drop = (list) => list.map((p) => (p._id === plugin._id ? { ...p, versions: (p.versions || []).filter((v) => v.version !== version) } : p))
      setApproved(drop)
      setPending(drop)
      toast.show({ message: `גרסה ${version} נמחקה` })
    } catch (error) {
      fail(error, 'לא הצלחנו למחוק את הגרסה.')
    }
  }, [confirm, track, setApproved, setPending, toast, fail])

  const edit = useCallback(async (plugin) => {
    try {
      const result = await track([plugin._id], () => api.loadEditData(plugin._id))
      // תוסף שירות: עריכה ישירה חסומה גם למנהל — שינוי רק דרך הגשה חדשה
      if (result.editBlocked) {
        toast.show({ tone: 'info', message: 'זה תוסף שירות: משנים אותו רק בהגשה חדשה, בדף "הגשות השירות" של התוסף.' })
        return
      }
      openEdit({ ...result, _id: result.id })
    } catch (error) {
      fail(error, 'לא הצלחנו לפתוח את העריכה.')
    }
  }, [track, toast, openEdit, fail])

  const actions = useMemo(() => ({
    approve, performApprove, reject, unapprove, deleteForever, deleteVersion, edit, assign,
    suspend: (list, options) => setSuspended(list, 'suspend', options),
    resume: (list, options) => setSuspended(list, 'resume', options),
  }), [approve, performApprove, reject, unapprove, deleteForever, deleteVersion, edit, assign, setSuspended])

  return { actions, busy, bulkProgress, stopping, stopBulk }
}
