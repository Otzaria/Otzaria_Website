import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import {
  listLibraryFiles,
  listPushFiles,
  fetchRawContent,
  commitBatch,
  gitBlobSha,
  pathToTitle,
  pathToCategory,
  getLibraryGitHubConfig,
} from '@/lib/dicta/github-api';
import { threeWayMerge } from '@/lib/dicta/text-diff';

const MAX_FILES_PER_COMMIT = 200;

const CLEAR_CONFLICT = { theirsContent: null, theirsSha: null, detectedAt: null, conflictCount: 0 };

/**
 * משיכה מגיטהאב (כיוון אחד, ללא דחיפה).
 *  - ספר חדש → נוצר מיד (מדיניות "ספר חדש = מיידי").
 *  - ספר קיים ש-upstream שלו השתנה ואין אצלנו שינוי מקומי → fast-forward.
 *  - ספר קיים עם שינוי מקומי (content != baseContent) → מושאר למיזוג 3-way (שלב 5).
 *  - ספר שנעלם מגיטהאב → מסומן removedUpstream (לא נמחק).
 *
 * @param {{onlyNew?: boolean}} [opts] onlyNew=true: רק הוספת ספרים חדשים (לסנכרון מהיר)
 */
export async function pullLibraryBooks({ onlyNew = false } = {}) {
  await connectDB();
  const config = getLibraryGitHubConfig();

  const files = await listLibraryFiles(config); // [{path, sha, size}]
  const existing = await LibraryBook.find({}, 'path baseSha content baseContent').lean();
  const byPath = new Map(existing.map((b) => [b.path, b]));
  const seen = new Set();

  let added = 0, fastForwarded = 0, diverged = 0, unchanged = 0, errors = 0;
  const now = new Date();

  for (const f of files) {
    seen.add(f.path);
    const cur = byPath.get(f.path);

    try {
      if (!cur) {
        const content = await fetchRawContent(f.path, config);
        await LibraryBook.create({
          path: f.path,
          title: pathToTitle(f.path),
          category: pathToCategory(f.path),
          content,
          baseContent: content,
          baseSha: f.sha,
          version: 1,
          syncStatus: 'clean',
          lastSyncedAt: now,
        });
        added++;
        continue;
      }

      if (onlyNew) { unchanged++; continue; }
      if (cur.baseSha === f.sha) { unchanged++; continue; } // upstream לא השתנה

      const locallyDiverged = (cur.content || '') !== (cur.baseContent || '');
      if (locallyDiverged) {
        diverged++; // נשאר למיזוג 3-way בשלב 5
        continue;
      }

      // אין שינוי מקומי — אימוץ הגרסה החדשה מ-upstream
      const content = await fetchRawContent(f.path, config);
      await LibraryBook.updateOne(
        { _id: cur._id },
        { $set: { content, baseContent: content, baseSha: f.sha, syncStatus: 'clean', removedUpstream: false, lastSyncedAt: now } }
      );
      fastForwarded++;
    } catch (e) {
      console.error('pullLibraryBooks error on', f.path, e.message);
      errors++;
    }
  }

  // ספרים שנעלמו מ-upstream
  const removed = existing.filter((b) => !seen.has(b.path));
  if (removed.length) {
    await LibraryBook.updateMany(
      { _id: { $in: removed.map((b) => b._id) } },
      { $set: { removedUpstream: true } }
    );
  }

  return {
    total: files.length,
    added,
    fastForwarded,
    diverged,
    unchanged,
    errors,
    removedUpstream: removed.length,
  };
}

const norm = (s) => String(s == null ? '' : s).replace(/\r\n/g, '\n');

/**
 * דחיפה לגיטהאב עם מיזוג 3-way, ב-**commit אחד לכל השינויים** (Git Data API).
 * לכל ספר: אם upstream השתנה מאז הבסיס — ממזגים (base, ours, theirs).
 * קונפליקט → מסומן ומדולג לפתרון ידני. שאר השינויים נארזים יחד ל-commit אחד
 * (או למספר commits אם יש המון קבצים), במקום commit נפרד לכל ספר.
 *
 * @param {{force?: boolean}} [opts] force=true: עובר על כל הספרים, לא רק dirty
 */
export async function pushLibraryToGitHub({ force = false } = {}) {
  await connectDB();
  const config = getLibraryGitHubConfig();
  if (!config.token) {
    throw Object.assign(new Error('חסר טוקן GitHub (DICTA_LIBRARY_GITHUB_TOKEN) לדחיפה'), { code: 'NO_TOKEN' });
  }

  // shas עדכניים ב-upstream (משיכה) — להחלטות המיזוג
  const files = await listLibraryFiles(config);
  const upstreamSha = new Map(files.map((f) => [f.path, f.sha]));

  // shas בריפו הדחיפה — לזיהוי שינוי. כש-push=pull זה אותו דבר; אחרת רשימה נפרדת.
  const samePull = config.pushRepo === config.pullRepo && config.pushBranch === config.pullBranch;
  let pushShaMap = upstreamSha;
  if (!samePull) {
    const pf = await listPushFiles(config);
    pushShaMap = new Map(pf.map((f) => [f.path, f.sha]));
  }

  // בחירת ספרים: ב-force כולם; אחרת dirty או כאלה ש-upstream שלהם השתנה מאז הבסיס
  // (גם 'clean'), כדי שספר שכבר נדחף לא יישאר תקוע כשמופיע שינוי חדש ב-upstream.
  const candidates = await LibraryBook.find(
    { removedUpstream: { $ne: true } },
    '_id path baseSha syncStatus'
  ).lean();
  const selectedIds = candidates
    .filter((b) => {
      if (force || b.syncStatus === 'dirty') return true;
      const up = upstreamSha.get(b.path);
      return !!up && up !== b.baseSha;
    })
    .map((b) => b._id);

  const books = await LibraryBook.find({ _id: { $in: selectedIds } });
  const results = { scanned: books.length, pushed: 0, mergedClean: 0, conflicts: 0, upToDate: 0, errors: 0, commits: 0, commitSha: null, details: [] };

  const now = new Date();
  const toApply = []; // { book, merged, theirs, theirsSha, blobSha, changed }

  // שלב 1: מיזוג בזיכרון (בלי כתיבה לרשת). קונפליקטים מסומנים מיד.
  for (const book of books) {
    try {
      const curUpSha = upstreamSha.get(book.path);
      const hadUpstreamChange = !!curUpSha && curUpSha !== book.baseSha;

      let theirs, theirsSha;
      if (hadUpstreamChange) {
        theirs = await fetchRawContent(book.path, config);
        theirsSha = curUpSha;
      } else {
        theirs = book.baseContent || '';
        theirsSha = book.baseSha;
      }

      let merged, conflicts = [];
      if (!hadUpstreamChange) {
        merged = norm(book.content);
      } else {
        const m = threeWayMerge(book.baseContent || '', book.content || '', theirs);
        merged = m.merged;
        conflicts = m.conflicts;
        if (!conflicts.length) results.mergedClean++;
      }

      if (conflicts.length > 0) {
        book.syncStatus = 'conflict';
        book.conflict = { theirsContent: theirs, theirsSha, detectedAt: now, conflictCount: conflicts.length };
        await book.save();
        results.conflicts++;
        results.details.push({ path: book.path, status: 'conflict', count: conflicts.length });
        continue;
      }

      const blobSha = gitBlobSha(merged);
      const changed = pushShaMap.get(book.path) !== blobSha;
      toApply.push({ book, merged, theirs, theirsSha, blobSha, changed });
    } catch (e) {
      console.error('push merge error on', book.path, e.message);
      results.errors++;
      results.details.push({ path: book.path, status: 'error', error: e.message });
    }
  }

  // עדכון ה-DB לספר אחרי שתוכנו נמצא בריפו (נדחף בהצלחה, או כבר היה שם).
  const persist = async (x) => {
    x.book.content = x.merged;
    if (samePull) {
      // הריפו עכשיו מכיל את merged → הבסיס מתעדכן ל-merged (אין מחזור-סרק)
      x.book.baseContent = x.merged;
      x.book.baseSha = x.blobSha;
    } else {
      // דחיפה לפורק — ה-upstream (משיכה) לא הושפע מהדחיפה שלנו
      x.book.baseContent = x.theirs;
      x.book.baseSha = x.theirsSha;
    }
    x.book.pushSha = x.blobSha;
    x.book.syncStatus = 'clean';
    x.book.conflict = CLEAR_CONFLICT;
    x.book.lastPushedAt = now;
    x.book.lastSyncedAt = now;
    await x.book.save();
    x.processed = true;
  };

  // שלב 2: commit לכל הקבצים ששונו (אצווה אחת, או כמה אם מעבר ל-MAX_FILES_PER_COMMIT).
  // מעדכנים DB מיד אחרי כל אצווה שנדחפה, כך שכשל באצווה מאוחרת לא ישאיר אצווה
  // קודמת שנדחפה לגיטהאב אך מסומנת dirty (ותידחף שוב בריצה הבאה).
  const changedItems = toApply.filter((x) => x.changed);
  if (changedItems.length > 0) {
    try {
      for (let i = 0; i < changedItems.length; i += MAX_FILES_PER_COMMIT) {
        const slice = changedItems.slice(i, i + MAX_FILES_PER_COMMIT);
        const filesToCommit = slice.map((x) => ({ fullPath: `${config.basePath}/${x.book.path}`, content: x.merged }));
        const message = slice.length === 1
          ? `tikkun: ${slice[0].book.title}`
          : `tikkun: ${slice.length} ספרים (עריכה משותפת באוצריא)`;
        const { commitSha } = await commitBatch({ files: filesToCommit, message }, config);
        results.commitSha = commitSha;
        results.commits++;

        for (const x of slice) {
          try {
            await persist(x);
            results.pushed++;
            results.details.push({ path: x.book.path, status: 'pushed' });
          } catch (dbErr) {
            console.error('push db update error on', x.book.path, dbErr.message);
            results.errors++;
          }
        }
      }
    } catch (e) {
      console.error('commitBatch failed', e.message);
      // הקומיט נכשל — רק הקבצים שטרם עובדו יישארו dirty וייבחרו שוב בריצה הבאה
      results.errors += changedItems.filter((x) => !x.processed).length;
      results.details.push({ status: 'commit-error', error: e.message });
      return results;
    }
  }

  // שלב 3: עדכון ה-DB לספרים שכבר היו עדכניים בריפו (לא שונו)
  for (const x of toApply) {
    if (x.processed) continue;
    try {
      await persist(x);
      results.upToDate++;
    } catch (e) {
      console.error('push db update error on', x.book.path, e.message);
      results.errors++;
    }
  }

  return results;
}
