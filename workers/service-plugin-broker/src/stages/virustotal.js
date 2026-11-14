import { openAsBlob } from 'node:fs'
import { Rejection, abortReason, operator, transient } from '../errors.js'
import { sleep } from '../util.js'

const VT = 'https://www.virustotal.com/api/v3'
const SMALL_UPLOAD_BYTES = 32 * 1024 * 1024
const FRESH_REPORT_MS = 7 * 24 * 3600_000
const QUOTA_BACKOFF_MS = [60_000, 120_000, 300_000, 600_000]

export class VtClient {
  constructor({ apiKey, fetchImpl = globalThis.fetch, signal, pollIntervalMs = 30_000, maxWaitMs = 30 * 60_000, backoffMs = QUOTA_BACKOFF_MS }) {
    this.apiKey = apiKey
    this.fetch = fetchImpl
    this.signal = signal
    this.pollIntervalMs = pollIntervalMs
    this.maxWaitMs = maxWaitMs
    this.backoffMs = backoffMs
  }

  /** בקשה עם המתנה מקומית ארוכה על 429 (מכסת VirusTotal נפרדת ממכסת Claude). */
  async request(url, init = {}) {
    const target = new URL(url)
    if (target.protocol !== 'https:' || !(target.hostname === 'www.virustotal.com' || target.hostname.endsWith('.virustotal.com'))) {
      throw operator('virustotal_bad_url', 'כתובת VirusTotal לא צפויה')
    }
    for (let attempt = 0; ; attempt++) {
      let res
      try {
        res = await this.fetch(target.href, { ...init, redirect: 'error', signal: this.signal, headers: { 'x-apikey': this.apiKey, accept: 'application/json', ...init.headers } })
      } catch {
        if (this.signal?.aborted) throw abortReason(this.signal)
        if (attempt >= this.backoffMs.length) throw transient('virustotal_network', 'VirusTotal אינו זמין כרגע')
        await sleep(this.backoffMs[attempt], this.signal)
        continue
      }
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel().catch(() => {})
        if (attempt >= this.backoffMs.length) {
          throw transient(res.status === 429 ? 'virustotal_quota' : 'virustotal_unavailable',
            res.status === 429 ? 'מכסת VirusTotal מוצתה זמנית' : 'VirusTotal אינו זמין כרגע')
        }
        await sleep(this.backoffMs[attempt], this.signal)
        continue
      }
      if (res.status === 401 || res.status === 403) throw operator('virustotal_auth', 'מפתח VirusTotal נדחה — נדרש טיפול של אחראי השרת')
      if (res.status === 404) return null
      if (!res.ok) throw transient('virustotal_http', `VirusTotal החזיר שגיאה ${res.status}`)
      return res.json()
    }
  }

  async upload(file, size) {
    let url = `${VT}/files`
    if (size > SMALL_UPLOAD_BYTES) {
      const r = await this.request(`${VT}/files/upload_url`)
      if (typeof r?.data !== 'string') throw transient('virustotal_upload_url', 'לא התקבלה כתובת העלאה מ-VirusTotal')
      url = r.data
    }
    const form = new FormData()
    form.append('file', await openAsBlob(file), 'file')
    const r = await this.request(url, { method: 'POST', body: form })
    const id = r?.data?.id
    if (typeof id !== 'string') throw transient('virustotal_upload', 'העלאה ל-VirusTotal לא החזירה מזהה ניתוח')
    return id
  }

  async waitForAnalysis(id) {
    const started = Date.now()
    for (;;) {
      const r = await this.request(`${VT}/analyses/${encodeURIComponent(id)}`)
      const attrs = r?.data?.attributes
      if (attrs?.status === 'completed') return attrs.stats ?? {}
      if (Date.now() - started > this.maxWaitMs) throw transient('virustotal_incomplete', 'ניתוח VirusTotal לא הושלם בזמן — אין לראות בכך "נקי"')
      await sleep(this.pollIntervalMs, this.signal)
    }
  }
}

/** ניצול דוח עדכני לפי hash; העלאה כשאין; ניתוח מחדש לדוח ישן. */
export async function scanFile(vt, { file, sha256, size }) {
  const report = await vt.request(`${VT}/files/${sha256}`)
  const attrs = report?.data?.attributes
  const lastAt = typeof attrs?.last_analysis_date === 'number' ? attrs.last_analysis_date * 1000 : 0
  if (attrs?.last_analysis_stats && Date.now() - lastAt < FRESH_REPORT_MS) {
    return { source: 'existing_report', stats: attrs.last_analysis_stats }
  }
  let analysisId
  if (report) {
    const r = await vt.request(`${VT}/files/${sha256}/analyse`, { method: 'POST' })
    analysisId = r?.data?.id
  }
  if (typeof analysisId !== 'string') analysisId = await vt.upload(file, size)
  return { source: 'analysis', analysisId, stats: await vt.waitForAnalysis(analysisId) }
}

export function judgeStats(stats) {
  const n = (k) => (Number.isFinite(stats?.[k]) ? stats[k] : 0)
  if (n('malicious') > 0 || n('suspicious') > 0) return 'flagged'
  if (n('undetected') + n('harmless') === 0) return 'incomplete'
  return 'clean'
}

export async function virustotalStage(ctx, { client } = {}) {
  if (!ctx.config.vtApiKey) return { status: 'skipped_disabled' }
  if (!ctx.job.submission.virusTotalConsent) return { status: 'skipped_no_consent' }
  await ctx.ensureAssets()
  const vt = client ?? new VtClient({ apiKey: ctx.config.vtApiKey, fetchImpl: ctx.fetch, signal: ctx.signal })
  const results = []
  for (const asset of ctx.assetList()) {
    const r = await scanFile(vt, { file: ctx.localPath(asset), sha256: asset.sha256, size: asset.size })
    const verdict = judgeStats(r.stats)
    const label = asset.isPlugin ? 'קובץ התוסף' : `המתקין ${asset.name}`
    if (verdict === 'flagged') {
      throw new Rejection('virustotal',
        `VirusTotal: ${label} סומן כזדוני או חשוד בידי ${r.stats.malicious ?? 0} + ${r.stats.suspicious ?? 0} מנועים. ` +
        'הדחייה היא לפי מדיניות ואינה האשמה בכוונה; זיהוי שגוי אפשרי.', { key: asset.key, stats: r.stats })
    }
    if (verdict === 'incomplete') throw transient('virustotal_incomplete', `ניתוח VirusTotal של ${label} לא הפיק תוצאות מנועים`)
    results.push({ key: asset.key, source: r.source, analysisId: r.analysisId ?? null, stats: r.stats })
  }
  return { status: 'clean', results }
}
