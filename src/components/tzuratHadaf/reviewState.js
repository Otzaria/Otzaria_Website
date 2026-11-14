// צורת הדף — מצב העבודה בבדיקת עמוד: מה נשמר בטיוטה (state של PUT draft), מה נשלח בהגשה (POST submit),
// והסיכום שלפני ההגשה. טהור. CONTRACT: "בדיקת עמוד" ו"צורות התגובה".
import { normalizeLineOps } from '@/lib/tzuratHadaf/lineOps'
import { answerBody } from './fastLogic'
import { opsSummary } from './linesLogic'
import { MAX_NOTE, reportBody, validateReport } from './reportLogic'
import { CHECKS, STAGE_KEYS } from './labels'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export const emptyWork = () => ({ checks: {}, lineOps: [], itemAnswers: {}, manualItems: [], reports: [], note: '' })

/** מצב העבודה מטיוטה שהגיעה מהשרת (state לא מוכר או פגום — מתעלמים מהחלק הפגום) */
export function workFromDraft(state) {
  const w = emptyWork()
  if (!isObj(state)) return w
  if (isObj(state.checks)) {
    for (const c of CHECKS) if (state.checks[c.key] === 'ok' || state.checks[c.key] === 'issue') w.checks[c.key] = state.checks[c.key]
  }
  const ops = normalizeLineOps(state.lineOps)
  if (!ops.error) w.lineOps = ops.ops
  if (isObj(state.itemAnswers)) {
    for (const [id, v] of Object.entries(state.itemAnswers)) if (answerBody(v)) w.itemAnswers[id] = answerBody(v)
  }
  if (Array.isArray(state.manualItems)) w.manualItems = state.manualItems.filter((m) => isObj(m) && typeof m.ref === 'string' && typeof m.text === 'string')
  if (Array.isArray(state.reports)) w.reports = state.reports.filter((r) => isObj(r) && !validateReport(r))
  if (typeof state.note === 'string') w.note = state.note.slice(0, MAX_NOTE)
  return w
}

/** השלב מהטיוטה (ברירת המחדל — מבט כללי) */
export const stageFromDraft = (draft) => (STAGE_KEYS.includes(draft?.stage) ? draft.stage : 'overview')

/** הבדיקות של מבט כללי שעוד לא סומנו */
export const missingChecks = (checks) => CHECKS.filter((c) => !checks?.[c.key]).map((c) => c.key)

/** גוף ההגשה (POST submit). round — הסבב של העמוד כפי שנטען (השרת מחזיר 409 stale אם העמוד יובא מחדש בינתיים) */
export function submitBody(work, { round, version } = {}) {
  const checks = {}
  for (const c of CHECKS) if (work.checks?.[c.key]) checks[c.key] = work.checks[c.key]
  const itemAnswers = []
  for (const [item, v] of Object.entries(work.itemAnswers || {})) {
    const b = answerBody(v)
    if (b) itemAnswers.push({ item, ...b })
  }
  return {
    checks,
    lineOps: work.lineOps || [],
    itemAnswers,
    manualItems: (work.manualItems || []).map((m) => ({
      block: m.block,
      line: m.line,
      ref: m.ref,
      wi: m.wi,
      n: m.n,
      otz: m.otz || [],
      text: String(m.text || '').trim(),
      box: m.box || null,
    })),
    reports: (work.reports || []).map(reportBody),
    note: String(work.note || '').trim().slice(0, MAX_NOTE),
    ...(Number.isInteger(round) ? { round } : {}),
    ...(version ? { version } : {}),
  }
}

/** הסיכום שלפני ההגשה */
export function workSummary(model, work, items = []) {
  const lines = opsSummary(model, work.lineOps || [])
  const issues = CHECKS.filter((c) => work.checks?.[c.key] === 'issue').length
  const itemIds = new Set((items || []).map((i) => i.id))
  const answered = Object.entries(work.itemAnswers || {}).filter(([id, v]) => itemIds.has(id) && answerBody(v)).length
  return {
    checksDone: CHECKS.length - missingChecks(work.checks).length,
    checksTotal: CHECKS.length,
    issues,
    moved: lines.starts,
    confirmed: lines.confirms,
    rejected: lines.rejected,
    answered,
    items: itemIds.size,
    manual: (work.manualItems || []).length,
    reports: (work.reports || []).length,
  }
}
