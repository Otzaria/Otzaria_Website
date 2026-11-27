// @vitest-environment node
// /api/worker/v1/corrections/** — שירות הבדיקה במצב משיכה (CONTRACT §3.7), מול MongoDB אמיתי
// (mongodb-memory-server) ו-GitHub מדומה. בלי הבינארי — מדולג.
// מכסה: אימות (401/403), 204 + Retry-After, תפיסה/דופק/תוצאה דרך הראוטים, צורת JSON ו-no-store,
// 400/413/422/409/404, שליחה חוזרת, אצווה אחרי אישור לפרסום, ו"נראה לאחרונה" של הסוכן.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
const afterSpy = vi.hoisted(() => vi.fn())
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal()), after: afterSpy }))
// תקציב תפיסה מוקטן לבדיקה (במקום 20 שניות); null — ההגדרות כפי שנטענו.
const budgetOverride = vi.hoisted(() => ({ ms: null }))
vi.mock('@/lib/corrections/runtime', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    loadCorrectionsConfig: async (...args) => {
      const c = await mod.loadCorrectionsConfig(...args)
      return budgetOverride.ms === null ? c : { ...c, agent: { ...c.agent, claimBudgetMs: budgetOverride.ms } }
    },
  }
})

import ErrorReport from '@/models/ErrorReport'
import CorrectionJob from '@/models/CorrectionJob'
import CorrectionsAgentState from '@/models/CorrectionsAgentState'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { FakeGitHub } from '@/lib/corrections/testing/fake-github.js'
import { buildMockDecision } from '@/lib/corrections/testing/mock-verify.js'
import { handleReportingErrorsPost } from '@/lib/corrections/reporting-handler'
import { getCorrectionsConfig } from '@/lib/corrections/config'
import { POST as claimPOST } from './claim/route'
import { POST as heartbeatPOST } from './[jobId]/heartbeat/route'
import { POST as resultPOST } from './[jobId]/result/route'
import { POST as releasePOST } from './[jobId]/release/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const SECRET = 'N4vQ8r2LxT6mW1zK9pB3sD7fH5jY0cG-aE_uR2iO8tZ'
const AGENT = 'verify-1'
const ENV = {
  CORRECTIONS_VERIFY_ENABLED: '1', CORRECTIONS_VERIFY_TRANSPORT: 'pull', CORRECTIONS_AGENT_SECRET: SECRET, CORRECTIONS_AGENT_ID: AGENT,
  CORRECTIONS_VERIFY_AUTHORITY: 'technical_and_content', CORRECTIONS_VERIFY_REQUESTED_SCOPE: 'technical_and_content',
}
const PATH = 'ToratEmetToOtzaria/ספרים/אוצריא/תנך/תורה/בראשית.txt'
const LINE = '(א) <big>בְּ</big>רֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים'
const SEL = 'אֱלֹהִ֑ים'
const START = LINE.indexOf(SEL)
const BASE = 'http://localhost/api/worker/v1/corrections'

let gh
beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  gh = new FakeGitHub({ files: { [PATH]: `<h1>בראשית</h1>\n\n${LINE}\nסוף\n` } })
  vi.stubGlobal('fetch', gh.fetch)
  afterSpy.mockClear()
  // שער השבת בראוטים לפי השעון: יום שלישי קבוע, כדי שהבדיקות לא ייכשלו כשהן רצות בשישי אחר הצהריים
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'))
})
afterEach(() => {
  budgetOverride.ms = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function ingest(id) {
  const body = {
    schema_version: 2, report_id: id, report_kind: 'text_correction', book_title: 'בראשית', current_ref: 'בראשית א', line_number: 3,
    selected_text: 'בראשית', error_details: 'שם', context_text: '', file_path: 'אוצריא/תנך/תורה/בראשית.txt', source_folder: 'ToratEmetToOtzaria',
    library_version: '27', location: { line_index: 2, library_build_id: '27' },
    source_hint: { source_folder: 'ToratEmetToOtzaria', library_relative_path: 'אוצריא/תנך/תורה/בראשית.txt' },
    correction: { original_line: LINE, original_selection: SEL, selection_offset: { unit: 'utf16_code_units', start: START, end: START + SEL.length }, proposed_text: 'אֱלֹקִ֑ים', context_before: LINE.slice(0, START), context_after: '' },
  }
  const res = await handleReportingErrorsPost(new Request('http://x/api/reportingerrors', { method: 'POST', body: JSON.stringify(body) }), {
    connectDB: async () => {}, config: getCorrectionsConfig(ENV), rateLimit: () => true, notify: async () => ({ emailSent: false, duplicate: false }),
  })
  expect(res.status).toBe(200)
  return ErrorReport.findOne({ reportId: id }).lean()
}

const headers = (over = {}) => ({ authorization: `Bearer ${SECRET}`, 'x-agent-id': AGENT, 'x-agent-version': '0.1.0', ...over })

async function call(handler, url, { body, params = {}, hdrs = headers(), raw = false } = {}) {
  const res = await handler(
    new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...hdrs }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }),
    { params: Promise.resolve(params) },
  )
  const text = await res.text()
  return { res, text, json: text ? JSON.parse(text) : null }
}

const claim = (hdrs) => call(claimPOST, `${BASE}/claim`, { hdrs })
const heartbeat = (jobId, token) => call(heartbeatPOST, `${BASE}/${jobId}/heartbeat`, { params: { jobId }, hdrs: headers(token ? { 'x-lease-token': token } : {}) })
const release = (jobId, token, body, raw = false) => call(releasePOST, `${BASE}/${jobId}/release`, { params: { jobId }, hdrs: headers(token ? { 'x-lease-token': token } : {}), body, raw })
const result = (jobId, token, body, opts = {}) => call(resultPOST, `${BASE}/${jobId}/result`, { params: { jobId }, hdrs: headers({ 'x-lease-token': token, ...(opts.hdrs || {}) }), body, raw: opts.raw })

describe('/api/worker/v1/corrections', () => {
  it('אימות: בלי Bearer / סוד שגוי → 401; דחיפה → 403 agent_api_disabled; X-Agent-Id אחר → 403; JSON + no-store', async () => {
    for (const hdrs of [{ 'x-agent-id': AGENT }, headers({ authorization: `Bearer ${'X'.repeat(48)}` })]) {
      const { res, json } = await claim(hdrs)
      expect(res.status).toBe(401)
      expect(json).toEqual({ error: 'unauthorized' })
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
      expect(res.headers.get('www-authenticate')).toContain('Bearer')
    }
    expect((await claim(headers({ 'x-agent-id': 'other' }))).json).toEqual({ error: 'wrong_agent' })
    vi.stubEnv('CORRECTIONS_VERIFY_TRANSPORT', 'push')
    const push = await claim()
    expect(push.res.status).toBe(403)
    expect(push.json).toEqual({ error: 'agent_api_disabled' })
    expect(await CorrectionsAgentState.countDocuments({})).toBe(0)
  })

  it('ביקורת #314: תקציב התפיסה נספר מהכניסה לראוט — "נראה לאחרונה" איטי מעבר לתקציב → 204 בלי משימה ובלי lease; מתחתיו — נמסרת', async () => {
    // בקנה מידה מוקטן: תקציב של שנייה, ועיכוב של 1.05 שניות (בייצור: 21 שניות מול 20) בכתיבת "נראה לאחרונה" — לפני
    // שהראוט מגיע לתפיסה. השעון מדומה (Date), כך שאין המתנה אמיתית.
    budgetOverride.ms = 1000
    const r = await ingest('r-budget-entry')
    const original = CorrectionsAgentState.updateOne.bind(CorrectionsAgentState)
    let delayMs = 1050
    vi.spyOn(CorrectionsAgentState, 'updateOne').mockImplementation((filter, update, ...rest) => {
      if (update?.$set?.lastRoute) vi.setSystemTime(Date.now() + delayMs)
      return original(filter, update, ...rest)
    })
    const slow = await claim()
    expect(slow.res.status).toBe(204)
    expect(slow.text).toBe('')
    expect(slow.res.headers.get('retry-after')).toBe('5')
    expect(await CorrectionJob.countDocuments({ status: 'leased' })).toBe(0)
    expect(await CorrectionJob.countDocuments({})).toBe(0)
    expect((await ErrorReport.findById(r._id).lean()).dispatch.verify).toBe(true)
    expect(afterSpy).not.toHaveBeenCalled()
    delayMs = 950
    const fine = await claim()
    expect(fine.res.status).toBe(200)
    expect(fine.json.request.report_id).toBe(String(r._id))
    expect(await CorrectionJob.countDocuments({ status: 'leased' })).toBe(1)
  })

  it('אין עבודה → 204 בלי גוף, Retry-After ו-no-store; "נראה לאחרונה" וגרסה נרשמים', async () => {
    const { res, text } = await claim()
    expect(res.status).toBe(204)
    expect(text).toBe('')
    expect(res.headers.get('retry-after')).toBe('60')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const st = await CorrectionsAgentState.findOne({ agentId: AGENT }).lean()
    expect(st.agentVersion).toBe('0.1.0')
    expect(st.lastRoute).toBe('POST /api/worker/v1/corrections/claim')
    expect(st.lastSeenAt).toBeInstanceOf(Date)
  })

  it('תפיסה → דופק → תוצאה; שליחה חוזרת מקבלת אותה תשובה; אישור לפרסום מריץ אצווה ב-after', async () => {
    const r = await ingest('route-flow')
    const c = await claim()
    // אף אצווה לא רצה: התפיסה מתזמנת אצווה מלאה אחרי התשובה (בלי cron)
    expect(afterSpy).toHaveBeenCalledTimes(1)
    afterSpy.mockClear()
    expect(c.res.status).toBe(200)
    expect(c.res.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(c.json).sort()).toEqual(['jobId', 'leaseExpiresAt', 'leaseToken', 'request'])
    expect(c.json.request.report_id).toBe(String(r._id))
    expect(new Date(c.json.leaseExpiresAt).toISOString()).toBe(c.json.leaseExpiresAt)
    const { jobId, leaseToken, request } = c.json

    const hb = await heartbeat(jobId, leaseToken)
    expect(hb.res.status).toBe(200)
    expect(hb.json.cancelled).toBe(false)
    expect(new Date(hb.json.leaseExpiresAt).getTime()).toBeGreaterThan(Date.now())
    expect((await heartbeat(jobId, null)).json).toEqual({ error: 'lease_invalid' })
    expect((await heartbeat(jobId, null)).res.status).toBe(409)
    expect((await heartbeat('0'.repeat(24), leaseToken)).res.status).toBe(404)

    vi.stubEnv('DICTA_LIBRARY_GITHUB_TOKEN', 't')
    const decision = buildMockDecision(request, { scope: 'technical_and_content' })
    const first = await result(jobId, leaseToken, decision)
    // בלי מתג פרסום אוטומטי במסך — ידני, ואין אצווה
    expect(first.res.status).toBe(200)
    expect(first.json).toEqual({ outcome: 'manual' })
    expect(afterSpy).not.toHaveBeenCalled()
    const again = await result(jobId, leaseToken, decision)
    expect(again.json).toEqual({ outcome: 'manual', duplicate: true })
    expect((await ErrorReport.findById(r._id).lean()).manual.handoffReason).toBe('auto_publish_not_permitted')
  })

  it('אישור מלא כשהפרסום האוטומטי מותר → outcome=publish ואצווה מתוזמנת ב-after', async () => {
    vi.stubEnv('DICTA_LIBRARY_GITHUB_TOKEN', 't')
    const SystemConfig = (await import('@/models/SystemConfig')).default
    await SystemConfig.create({ key: 'corrections.runtime', label: 'x', value: { publishMode: 'pr', autoPublish: true } })
    await ingest('route-publish')
    const { json } = await claim()
    afterSpy.mockClear()
    const res = await result(json.jobId, json.leaseToken, buildMockDecision(json.request, { scope: 'technical_and_content' }))
    expect(res.json).toEqual({ outcome: 'publish' })
    expect(afterSpy).toHaveBeenCalledTimes(1)
  })

  it('תוצאה: JSON פגום → 400; גדול מדי → 413; תשובה פגומה → 422 invalid_result; בלי אסימון → 409; מזהה לא תקין → 404', async () => {
    await ingest('route-errors')
    const { json } = await claim()
    expect((await result(json.jobId, json.leaseToken, '{not json', { raw: true })).json).toEqual({ error: 'bad_request' })
    const big = await result(json.jobId, json.leaseToken, 'x'.repeat(1024 * 1024 + 1), { raw: true })
    expect(big.res.status).toBe(413)
    expect(big.json).toEqual({ error: 'payload_too_large' })
    expect((await result(json.jobId, 'y'.repeat(43), buildMockDecision(json.request))).json).toEqual({ error: 'lease_invalid' })
    expect((await result('nope', json.leaseToken, buildMockDecision(json.request))).res.status).toBe(404)
    const bad = await result(json.jobId, json.leaseToken, { ...buildMockDecision(json.request), decision: 'maybe' })
    expect(bad.res.status).toBe(422)
    expect(bad.json).toEqual({ error: 'invalid_result', reason: 'unknown_decision' })
  })

  it('release: מחזיר את המשימה לתור (גוף ריק או retry_after_seconds), ערך לא תקין → 400, אסימון זר → 409', async () => {
    await ingest('route-release')
    const first = await claim()
    expect((await release(first.json.jobId, first.json.leaseToken, { retry_after_seconds: -1 })).json).toEqual({ error: 'bad_request' })
    expect((await release(first.json.jobId, 'z'.repeat(43))).res.status).toBe(409)
    const ok = await release(first.json.jobId, first.json.leaseToken, '', true)
    expect(ok.res.status).toBe(200)
    expect(ok.json.released).toBe(true)
    expect(ok.res.headers.get('cache-control')).toBe('no-store')
    const second = await claim()
    expect(second.json.jobId).toBe(first.json.jobId)
    const later = await release(second.json.jobId, second.json.leaseToken, { retry_after_seconds: 30 })
    expect(later.json.released).toBe(true)
    expect(new Date(later.json.nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 25_000)
    expect((await claim()).res.status).toBe(204)
  })

  it('שבת/יו"ט: 503 shabbat עם Retry-After — לפני האימות ובלי שום כתיבה (אופליין, בלי Hebcal)', async () => {
    vi.setSystemTime(new Date('2026-11-28T10:00:00Z'))
    for (const hdrs of [headers(), headers({ authorization: `Bearer ${'X'.repeat(48)}` })]) {
      const { res, json } = await claim(hdrs)
      expect(res.status).toBe(503)
      expect(json).toEqual({ error: 'shabbat' })
      expect(res.headers.get('retry-after')).toBe('3600')
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect(await CorrectionsAgentState.countDocuments({})).toBe(0)
    vi.setSystemTime(new Date('2026-11-28T20:00:00Z'))
    expect((await claim()).res.status).toBe(204)
  })
})
