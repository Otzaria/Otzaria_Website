/**
 * מפצל פעולות המתנדב מגוף הבקשה. הנתונים מהדפדפן (generation, revision, blob) משמשים
 * רק כתנאי "התצוגה עדכנית" — לעולם לא כמקור ליעד כתיבה.
 */
import {
  claimReport, releaseReport, reassignReport, approveReport, editAndApproveReport, rejectReport,
  closeManualReport, resubmitToService, previewSourceChoice,
} from './volunteer.js';
import { triggerWorkerBatch } from './run-batch.js';

// פעולות שמסמנות dispatch ולכן יוצרות עבודה חדשה לתור.
const DISPATCHING_ACTIONS = new Set(['approve', 'edit_approve', 'resubmit']);

const int = (v) => (Number.isSafeInteger(v) ? v : undefined);
const str = (v, max = 20_000) => (typeof v === 'string' && v.length <= max ? v : undefined);

export async function runReportAction({ user, id, body, config, deps = {}, now = new Date() }) {
  const result = await dispatchAction({ user, id, body, config, deps, now });
  // "כבר תוקן" נסגר בלי פרסום, ולכן אינו עבודה לתור.
  if (result.status === 200 && DISPATCHING_ACTIONS.has(body?.action) && result.body?.result !== 'already_fixed') {
    triggerWorkerBatch(deps.schedule, `action ${body.action} trigger failed`);
  }
  return result;
}

async function dispatchAction({ user, id, body, config, deps, now }) {
  const generation = int(body?.generation);
  const common = { user, id, generation, config, deps, now };
  switch (body?.action) {
    case 'claim':
      return claimReport(common);
    case 'release':
      return releaseReport(common);
    case 'reassign':
      return reassignReport({ ...common, targetUserId: str(body.targetUserId, 64) });
    case 'approve':
      return approveReport({ ...common, revision: int(body.revision), seenBlobSha: str(body.seenBlobSha, 64) });
    case 'edit_approve':
      return editAndApproveReport({
        ...common, revision: int(body.revision), baseLine: str(body.baseLine), newLine: str(body.newLine),
        targetPath: body.targetPath == null ? null : str(body.targetPath, 1000) ?? '', targetLineIndex: int(body.targetLineIndex),
        seenBlobSha: str(body.seenBlobSha, 64), note: str(body.note, 1000),
      });
    case 'reject':
      return rejectReport({ ...common, reason: str(body.reason, 2000) });
    case 'close_manual':
      return closeManualReport({ ...common, note: str(body.note, 2000) });
    case 'resubmit':
      return resubmitToService(common);
    case 'preview_source':
      return previewSourceChoice({ user, id, path: str(body.path, 1000), lineIndex: int(body.lineIndex), config, deps });
    default:
      return { status: 400, body: { error: 'unknown_action' } };
  }
}
