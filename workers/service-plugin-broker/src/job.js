import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { appendFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { INSTALLER_EXTENSIONS, LIMITS } from './policy.js'
import { operator, transient } from './errors.js'
import { buildChildEnv, expandWrapper, runProcess } from './process.js'
import { limitStream } from './httpDownload.js'
import { OBJECT_ID_RE, ensureDir, exists, sha256File, throwIfAborted } from './util.js'

const KNOWN_EXTENSIONS = new Set(['.otzplugin', ...Object.values(INSTALLER_EXTENSIONS).flat()])

export function jobPaths(dataDir, reviewId) {
  if (!OBJECT_ID_RE.test(String(reviewId))) throw new Error('invalid review id')
  const jobDir = path.join(dataDir, 'jobs', reviewId)
  // private/ לעולם אינו נקשר לבידוד: כלי מפענח שנפרץ אינו יכול לזייף את תוצאת Claude או לשתול לו הגדרות.
  const privateDir = path.join(dataDir, 'private', reviewId)
  return {
    jobDir,
    privateDir,
    assetsDir: path.join(jobDir, 'assets'),
    reviewDir: path.join(privateDir, 'review'),
    extractDir: path.join(jobDir, 'extract'),
    tmpDir: path.join(jobDir, 'tmp'),
    stageLog: path.join(privateDir, 'stages.log'),
    claudeResult: path.join(privateDir, 'claude-result.json'),
    mcpConfig: path.join(privateDir, 'mcp-empty.json'),
    snapshotDir: path.join(dataDir, 'snapshots', reviewId),
  }
}

export function snapshotDirFor(dataDir, reviewId) {
  return OBJECT_ID_RE.test(String(reviewId)) ? path.join(dataDir, 'snapshots', reviewId) : null
}

/** שם מקומי: מפתח הקובץ + סיומת מוכרת בלבד (שם הקובץ של המפתח אינו נוגע במערכת הקבצים). */
export function localAssetName(key, name) {
  const lower = String(name ?? '').toLowerCase()
  const ext = [...KNOWN_EXTENSIONS].find((e) => lower.endsWith(e)) ?? ''
  return `${key}${ext}`
}

/** הקשר משימה אחת: נתיבים, קבלות, הורדת קבצים והרצת כלים. */
export class JobContext {
  constructor({ job, config, api, signal, log = () => {}, fetchImpl = globalThis.fetch }) {
    this.job = job
    this.config = config
    this.api = api
    this.signal = signal
    this.log = log
    this.fetch = fetchImpl
    this.paths = jobPaths(config.dataDir, job.reviewId)
    this.receipts = new Map()
    for (const r of job.receipts ?? []) {
      if (r?.digest === job.manifestDigest && typeof r.stage === 'string') this.receipts.set(r.stage, r)
    }
    this.memo = new Map()
  }

  /** קובץ התוסף ואחריו המתקינים (ריק בעדכון תוסף בלבד). */
  assetList() {
    const list = [{ key: 'plugin', name: 'plugin.otzplugin', size: this.job.plugin.size, sha256: this.job.plugin.sha256, isPlugin: true }]
    for (const a of this.job.assets ?? []) list.push({ ...a, isPlugin: false })
    return list
  }

  localPath(asset) {
    return path.join(this.paths.assetsDir, localAssetName(asset.key, asset.name))
  }

  once(key, fn) {
    if (!this.memo.has(key)) this.memo.set(key, fn())
    return this.memo.get(key)
  }

  async stageLog(stage, event, data = {}) {
    try {
      await ensureDir(this.paths.privateDir)
      await appendFile(this.paths.stageLog, JSON.stringify({ at: new Date().toISOString(), stage, event, ...data }) + '\n')
    } catch {
      /* יומן בלבד */
    }
  }

  /** מוריד כל קובץ מה-API של המתווך ומאמת גודל ו-SHA-256 מול המשימה. */
  ensureAssets() {
    return this.once('assets', async () => {
      await ensureDir(this.paths.assetsDir)
      const out = []
      for (const asset of this.assetList()) {
        throwIfAborted(this.signal)
        const file = this.localPath(asset)
        if (await exists(file)) {
          const local = await sha256File(file)
          if (local.sha256 === asset.sha256 && local.size === asset.size) {
            out.push({ key: asset.key, size: local.size, sha256: local.sha256 })
            continue
          }
          await rm(file, { force: true })
        }
        out.push({ key: asset.key, ...(await this.#download(asset, file)) })
      }
      return out
    })
  }

  async #download(asset, file) {
    const max = asset.isPlugin ? LIMITS.pluginBytes : LIMITS.installerBytes
    if (!(asset.size > 0 && asset.size <= max) || !/^[0-9a-f]{64}$/.test(asset.sha256 ?? '')) {
      throw operator('job_invalid_asset', `פרטי הקובץ ${asset.key} במשימה אינם תקינים`)
    }
    const res = await this.api.openAsset(this.job.reviewId, asset.key, this.job.leaseToken, this.signal)
    const tmp = `${file}.part`
    const hash = createHash('sha256')
    const counter = { bytes: 0 }
    try {
      await pipeline(
        limitStream(res.body, asset.size, counter),
        async function* (source) {
          for await (const chunk of source) {
            hash.update(chunk)
            yield chunk
          }
        },
        createWriteStream(tmp, { flags: 'w', mode: 0o640 }),
        { signal: this.signal },
      )
    } catch (err) {
      await rm(tmp, { force: true })
      if (this.signal?.aborted) throw err
      if (err?.code === 'too_large') throw operator('asset_size_mismatch', `הקובץ ${asset.key} שהתקבל מהאתר גדול מהמוצהר`)
      throw transient('asset_download_failed', `הורדת הקובץ ${asset.key} מהאתר נכשלה`)
    }
    const digest = hash.digest('hex')
    const header = res.headers.get('x-content-sha256')
    if (counter.bytes !== asset.size || digest !== asset.sha256 || (header && header.toLowerCase() !== digest)) {
      await rm(tmp, { force: true })
      throw operator('asset_hash_mismatch', `הקובץ ${asset.key} שבאחסון האתר אינו תואם לגודל או ל-SHA-256 שנרשמו`)
    }
    await rename(tmp, file)
    return { size: counter.bytes, sha256: digest }
  }

  /** הרצת כלי חיצוני עם סביבה מינימלית. `sandbox` ({in, out}) מפעיל את SANDBOX_WRAPPER לקלט ולפלט של ההפעלה בלבד. */
  exec(command, args, { sandbox = null, env = {}, ...opts } = {}) {
    return runProcess(command, args, {
      signal: this.signal,
      wrapper: sandbox ? expandWrapper(this.config.sandboxWrapper, sandbox) : null,
      env: buildChildEnv({ TMPDIR: this.paths.tmpDir, ...env }),
      ...opts,
    })
  }

  async writeJson(file, value) {
    await writeFile(file, JSON.stringify(value), { mode: 0o640 })
  }
}
