import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { LIMITS } from '../policy.js'
import { Rejection, transient } from '../errors.js'
import { DownloadError } from '../httpDownload.js'
import { TarError } from '../tar.js'
import { buildHotspots } from '../prescan.js'
import {
  SourceCollector, SourceFormatError, SourceLimitError, buildDiffText, collectSource, copyTextFiles, describeTarError,
  formatIndex, readSnapshot, writeSnapshot,
} from '../source.js'
import { collectUploadedPlugin } from '../pluginSource.js'
import { snapshotDirFor } from '../job.js'
import { ensureDir, escapeForList, removeDir } from '../util.js'

const OVER_LIMIT_NOTE = 'חריגה ממגבלות המקור אינה אישור חלקי: ההגשה נדחית, ויש לצמצם את המקור (למשל להוציא קבצים שנוצרו אוטומטית) ולהגיש מחדש.'

async function buildSnapshot(ctx, snapshotDir) {
  await removeDir(snapshotDir)
  const filesDir = await ensureDir(path.join(snapshotDir, 'files'))
  const collector = new SourceCollector(filesDir, LIMITS)
  const perSource = []
  try {
    await collectUploadedPlugin(ctx, collector)
  } catch (err) {
    await removeDir(snapshotDir)
    if (err instanceof SourceLimitError || err instanceof SourceFormatError) throw new Rejection('source', `${err.message}. ${OVER_LIMIT_NOTE}`)
    throw err
  }
  for (const src of ctx.job.submission.sources) {
    try {
      const r = await collectSource({ repository: src.repository, commit: src.commit, collector, signal: ctx.signal, fetchImpl: ctx.fetch })
      perSource.push({ repository: src.repository, commit: src.commit, entries: r.entries })
    } catch (err) {
      await removeDir(snapshotDir)
      if (err instanceof SourceLimitError) throw new Rejection('source', `${err.message}. ${OVER_LIMIT_NOTE}`)
      if (err instanceof SourceFormatError) throw new Rejection('source', `${src.repository}: ${err.message}`)
      if (err instanceof TarError) throw new Rejection('source', `${src.repository}: ${describeTarError(err)}`)
      if (err instanceof DownloadError) {
        if (err.code === 'not_found') {
          throw new Rejection('source', `המקור ${src.repository} ב-commit ${src.commit} אינו נגיש לציבור ב-GitHub. נדרש מקור ציבורי שאפשר לסקור.`)
        }
        if (err.code === 'too_large') throw new Rejection('source', `ארכיון המקור של ${src.repository} גדול מדי. ${OVER_LIMIT_NOTE}`)
        throw transient('source_fetch_failed', `הורדת המקור ${src.repository} מ-GitHub נכשלה זמנית`)
      }
      throw err
    }
  }
  const stats = { textFiles: collector.textFiles, textBytes: collector.textBytes, binaryFiles: collector.binaryFiles, perSource }
  await writeSnapshot(snapshotDir, collector.rows, {
    reviewId: ctx.job.reviewId, manifestDigest: ctx.job.manifestDigest, sources: ctx.job.submission.sources, uploadedPluginSha256: ctx.job.plugin.sha256, stats,
  })
  return { rows: collector.rows, stats }
}

/** תמונת מקור (נשמרת לטובת ההשוואה הבאה) + תיקיית הסקירה עם INDEX ו-DIFF. */
export function ensureSource(ctx) {
  return ctx.once('source', async () => {
    const snapshotDir = ctx.paths.snapshotDir
    let snap = await readSnapshot(snapshotDir)
    if (!snap || snap.manifestDigest !== ctx.job.manifestDigest || snap.uploadedPluginSha256 !== ctx.job.plugin.sha256) snap = await buildSnapshot(ctx, snapshotDir)
    const { rows, stats } = snap

    const reviewDir = ctx.paths.reviewDir
    await removeDir(reviewDir)
    const filesDir = path.join(reviewDir, 'files')
    await copyTextFiles(rows, path.join(snapshotDir, 'files'), filesDir)
    await writeFile(path.join(reviewDir, 'INDEX.txt'), formatIndex(rows))

    const prev = ctx.job.previousApproved?.reviewId
    const prevDir = prev ? snapshotDirFor(ctx.config.dataDir, prev) : null
    const prevSnap = prevDir ? await readSnapshot(prevDir) : null
    const diff = await buildDiffText({
      previous: prevSnap ? { rows: prevSnap.rows, dir: path.join(prevDir, 'files') } : null,
      current: { rows, dir: filesDir },
      previousLabel: prevSnap ? `${prev}, גרסת תוסף ${ctx.job.previousApproved.pluginVersion ?? '?'}` : '',
    })
    await writeFile(path.join(reviewDir, 'DIFF.txt'), diff)
    return { rows, stats, filesDir, previousSnapshot: Boolean(prevSnap), previousExpected: Boolean(prev) }
  })
}

export function ensureHotspots(ctx) {
  return ctx.once('hotspots', async () => {
    const src = await ensureSource(ctx)
    const hs = await buildHotspots(src.rows, src.filesDir, { maxLines: ctx.config.hotspotMaxLines })
    if (hs.overLimit) {
      throw new Rejection('prescan', `רשימת הקבצים לבדיקה (HOTSPOTS) ארוכה מ-${hs.maxLines} שורות ולא תקוצר בשקט. ${OVER_LIMIT_NOTE}`)
    }
    await writeFile(path.join(ctx.paths.reviewDir, 'HOTSPOTS.txt'), hs.text)
    return hs
  })
}

/** כל workflow שבנה מתקין (לפי אישור הבנייה) חייב להיות קובץ טקסט במקור שנסקר. */
export function missingWorkflows(job, receipts, rows) {
  if (job.kind !== 'service') return []
  const byPath = new Map(rows.map((r) => [r.path, r]))
  return (receipts.get('attestation')?.data?.verified ?? [])
    .filter((v) => byPath.get(`${v.repository}/${v.workflowPath}`)?.kind !== 'text')
}

export async function sourceStage(ctx) {
  const s = await ensureSource(ctx)
  const missing = missingWorkflows(ctx.job, ctx.receipts, s.rows)
  if (missing.length) {
    throw new Rejection('source', missing.map((v) =>
      `ה-workflow שבנה את המתקין ${escapeForList(v.assetName ?? v.key)} (${escapeForList(v.workflowPath)}) לא נמצא כקובץ טקסט במקור שהוגש (${v.repository} ב-commit ${v.commit}), ולכן לא ניתן לסקור את תהליך הבנייה.`).join('\n'))
  }
  return {
    status: 'prepared',
    uploadedPluginSha256: ctx.job.plugin.sha256,
    textFiles: s.stats.textFiles,
    textBytes: s.stats.textBytes,
    binaryFiles: s.stats.binaryFiles,
    sources: s.stats.perSource,
    diffBase: s.previousSnapshot ? ctx.job.previousApproved.reviewId : null,
    fullReview: !s.previousSnapshot,
  }
}

export async function prescanStage(ctx) {
  const hs = await ensureHotspots(ctx)
  return { status: 'done', lines: hs.lines, counts: hs.counts }
}
