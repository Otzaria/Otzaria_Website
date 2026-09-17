/**
 * פרסום חבילת שינוי ל-GitHub (CONTRACT §5.3). היעד מגיע מההגדרה בלבד. כל ניסיון
 * קורא head+blob מאותו בסיס, מאמת את השורה, ובונה קומיט שה-parent שלו הוא אותו head.
 */
import { applyLineChange } from './source-text.js';
import { isAllowedRepoPath } from './resolver.js';
import { createGitSource } from './git-source.js';
import { ByteLru } from './lru.js';

export class PublishConflict extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.name = 'PublishConflict';
    this.reason = reason;
    this.details = details;
  }
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const CTRL_RE = /[\u0000-\u001f\u007f]/g;

/** טקסט בטוח לכותרת קומיט/PR: בלי תווי בקרה, בלי כתובות מייל ונתיבי דיסק. */
export function sanitizePublicText(s, max = 120) {
  return String(s ?? '')
    .replace(CTRL_RE, ' ')
    .replace(EMAIL_RE, '[הוסר]')
    .replace(/[A-Za-z]:\\[^\s]*/g, '[הוסר]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function prBranchName(reportId, attemptId) {
  return `corrections/${reportId}-${attemptId}`;
}

export function buildCommitMessage({ report, attemptId }) {
  const title = sanitizePublicText(report.bookTitle) || 'ספר';
  const ref = sanitizePublicText(report.currentRef);
  return `תיקון: ${title}${ref ? ` — ${ref}` : ''}\n\nReport-Id: ${report._id}\nPublish-Attempt: ${attemptId}`;
}

function buildPrBody({ report, change, attemptId, authority }) {
  return [
    'תיקון טקסט שאושר במערכת תיקוני הטקסט של אוצריא.',
    '',
    `קובץ: \`${change.path}\``,
    `שורה (1-based): ${change.lineIndex + 1}`,
    `מקור האישור: ${authority === 'service' ? 'שירות הבדיקה' : 'מתנדב מורשה'}`,
    '',
    '```diff',
    `- ${change.originalLine}`,
    `+ ${change.newLine}`,
    '```',
    '',
    `Report-Id: ${report._id}`,
    `Publish-Attempt: ${attemptId}`,
  ].join('\n');
}

/**
 * @param {object} a
 * @param {ReturnType<import('../dicta/github-api.js').createRepoClient>} a.client לקוח לריפו היעד (מההגדרה)
 * @param {{branch:string, mode:'pr'|'direct', maxRefRetries:number}} a.target
 * @returns {Promise<{status:'committed'|'pr_opened'|'already_fixed', commitSha?:string, prNumber?:number, prUrl?:string, branch?:string, rebased?:boolean}>}
 */
export async function publishChange({ client, target, change, report, attemptId, authority, cache = new ByteLru(16 * 1024 * 1024) }) {
  if (!isAllowedRepoPath(change.path)) throw new PublishConflict('path_not_allowed');
  if (target.mode !== 'pr' && target.mode !== 'direct') throw new PublishConflict('publish_disabled');
  const source = createGitSource({ client, ref: target.branch, cache });
  const message = buildCommitMessage({ report, attemptId });

  for (let i = 0; i < target.maxRefRetries; i++) {
    const head = await source.getHead();
    const file = await source.getFile(change.path, head.commitSha);
    if (!file) throw new PublishConflict('target_missing');
    if (file.lossy) throw new PublishConflict('non_utf8_source');
    const applied = applyLineChange(file.content, change.lineIndex, change.originalLine, change.newLine);
    if (applied.status === 'already_applied') return { status: 'already_fixed', baseCommitSha: head.commitSha };
    if (applied.status !== 'applied') {
      throw new PublishConflict(applied.reason || 'source_changed', { currentLine: applied.currentLine, commitSha: head.commitSha });
    }
    const rebased = file.blobSha !== change.baseBlobSha;
    const blob = await client.createBlob(Buffer.from(applied.content, 'utf8'));
    const tree = await client.createTree(head.treeSha, [{ path: change.path, mode: '100644', type: 'blob', sha: blob.sha }]);
    const commit = await client.createCommit({ message, treeSha: tree.sha, parents: [head.commitSha] });

    if (target.mode === 'direct') {
      try {
        await client.updateRef(target.branch, commit.sha);
      } catch (err) {
        if (err.status === 422 || err.status === 409) continue;
        throw err;
      }
      return { status: 'committed', commitSha: commit.sha, rebased };
    }

    const branch = prBranchName(report._id, attemptId);
    try {
      await client.createRef(branch, commit.sha);
    } catch (err) {
      if (err.status !== 422) throw err;
      const rec = await reconcilePublish({ client, target, report, attemptId, change, authority });
      if (rec.status !== 'not_found') return rec;
      throw new PublishConflict('pr_branch_exists');
    }
    const pr = await client.createPull({
      title: message.split('\n')[0],
      body: buildPrBody({ report, change, attemptId, authority }),
      head: branch,
      base: target.branch,
    });
    return { status: 'pr_opened', commitSha: commit.sha, prNumber: pr.number, prUrl: pr.url, branch, rebased };
  }
  throw Object.assign(new Error('branch kept advancing'), { code: 'REF_RETRIES_EXHAUSTED', transient: true });
}

/**
 * מאתר תוצאה של ניסיון שהסתיים בלי תיעוד ב-DB, לפי publish_attempt_id.
 * @returns {Promise<{status:'committed'|'pr_opened'|'not_found', commitSha?:string, prNumber?:number, prUrl?:string, branch?:string}>}
 */
export async function reconcilePublish({ client, target, report, attemptId, change, authority }) {
  const marker = `Publish-Attempt: ${attemptId}`;
  if (target.mode === 'direct') {
    const commits = await client.listCommits({ sha: target.branch, path: change.path, perPage: 50 });
    const hit = commits.find((c) => c.message.includes(marker));
    return hit ? { status: 'committed', commitSha: hit.sha } : { status: 'not_found' };
  }
  const branch = prBranchName(report._id, attemptId);
  const ref = await client.getRef(branch);
  if (!ref) return { status: 'not_found' };
  const commit = await client.getCommit(ref.sha);
  if (!commit.message.includes(marker)) return { status: 'not_found' };
  const owner = client.repo.split('/')[0];
  let pr = await client.findPullByHead(owner, branch);
  if (!pr) {
    pr = await client.createPull({
      title: commit.message.split('\n')[0],
      body: buildPrBody({ report, change, attemptId, authority }),
      head: branch,
      base: target.branch,
    });
  }
  return { status: pr.merged ? 'committed' : 'pr_opened', commitSha: ref.sha, prNumber: pr.number, prUrl: pr.url, branch, merged: pr.merged };
}
