import path from 'path';
import fs from 'fs-extra';
import sharp from 'sharp';
// נתיבים יחסיים (לא '@/') — כדי שגם סקריפט-הקישור המקומי
// (scripts/page-proof-link-import.mjs) ירוץ עם node רגיל
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import { resolveImageFsPath } from '../ocr/images.js';
import { DEFAULT_DOUBLE_PCT } from './sequences.js';
import { pickPrimary } from './fixesExport.js';
import {
  importAction,
  canReplacePage,
  incomingRevision,
  storedRevision,
  revisionFilter,
  planSequences,
  notStartedFilter,
  UNANSWERED_FILTER,
  RECUT_RESET,
} from './importRules.js';

// כתיבת חבילות-עמודים מפוענחות (packageParse) למסד ולדיסק. ייבוא-חוזר של
// אותו gid מוסיף עמודים ומעדכן עמודים שעוד איש לא נגע בהם; עמוד שיש לו
// הגשה (ממתינה או מאושרת) לא נדרס — הפעולות שהוגשו מתייחסות למזהי-השורות
// שלו, והחלפת התוכן הייתה מנתקת אותן. החריג: עמוד שממתין לזיהוי-מחדש
// ('recut') מוחלף כשמגיעה גרסה חדשה שלו (revision גבוה מזה שנשמר) ונפתח
// למעבר שני. ההחלטה לכל עמוד — importRules.importAction (טהור, עם טסטים).
//
// אחרי הכתיבה כל עמודי הספר מחולקים מחדש לרצפים (importRules.planSequences):
// עמודים שלא התחילו מקבלים רצף לפי מקומם בספר כולו, ועמודים שכבר חולקו או
// הוגשו שומרים את רצפם.
//
// מצב-קישור (links): העמוד מצביע לתמונת-עמוד שכבר קיימת בספר באתר
// (/uploads/books/<slug>/page.N.jpg) במקום לכתוב תמונה חדשה. הקואורדינטות
// נשארות במרחב התמונה של תוכנת-הספר (doc.size); העורך מותח את תמונת-האתר
// על אותו viewBox, ולכן הדבר תקין רק כשיחס-הממדים זהה — הקורא בודק זאת.

export const IMAGE_ROOT = '/uploads/page-proof';

// נתיב תמונת-העמוד: גרסה 1 — pNNNN.jpg (כמו תמיד); גרסה חדשה (מעבר שני) —
// pNNNN.rK.jpg, קובץ נפרד: כך תמונה חדשה לא דורסת את זו של העמוד השמור לפני
// שהעדכון המותנה הצליח (עדכון שנכשל לא משאיר את העמוד הישן עם תמונה חדשה)
export function imageRel(gid, page, revision = 1) {
  const base = `${IMAGE_ROOT}/${gid}/p${String(page).padStart(4, '0')}`;
  return revision > 1 ? `${base}.r${revision}.jpg` : `${base}.jpg`;
}

// כתיבה לקובץ זמני; הקורא מעביר אותו למקומו רק אחרי שהעדכון במסד הצליח
async function writeTemp(rel, buffer) {
  const fsPath = resolveImageFsPath(rel);
  await fs.ensureDir(path.dirname(fsPath));
  const tmp = `${fsPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buffer);
  return {
    commit: () => fs.move(tmp, fsPath, { overwrite: true }),
    drop: () => fs.remove(tmp),
  };
}

// לעמוד שממתין לזיהוי-מחדש: ההגשה הראשית שלו (בגרסה השמורה — אותו כלל של
// קובץ-התיקונים) משנה חיתוך ועוד לא יצאה בקובץ-תיקונים? אז הגרסה החדשה
// בחבילה נוצרה בלעדיה (importAction). הגשה כפולה אינה נבדקת — היא יוצאת
// בקובץ הכפולים, שאינו מסמן.
async function hasUnexportedRecut(prev) {
  const subs = await PageProofSubmission.find(
    { page: prev._id, status: 'approved', ...revisionFilter(storedRevision(prev)) },
    { needsRecut: 1, exportedAt: 1, reviewedAt: 1 }
  ).lean();
  const primary = pickPrimary(subs.map((s) => ({ ...s, approvedAt: s.reviewedAt })));
  return !!primary?.needsRecut && !primary.exportedAt;
}

// JPEG באיכות גבוהה במידות המקור (הקואורדינטות בפיקסלים שלהן): PNG של
// סריקה בגווני-אפור שוקל פי 3–5, בלי תועלת להגהה
async function toJpeg(bytes) {
  const img = sharp(Buffer.from(bytes), { limitInputPixels: 30000 * 30000 });
  const meta = await img.metadata();
  const buffer = await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return { buffer, width: meta.width || 0, height: meta.height || 0 };
}

// השדות שנדרשים לחלוקה לרצפים ולהחלטת-הייבוא (בלי doc — כבד)
const PLAN_FIELDS = { page: 1, seq: 1, required: 1, revision: 1, status: 1, activeCount: 1, approvedCount: 1, leasedUntil: 1, imagePath: 1 };

// חלוקה-מחדש לרצפים של כל עמודי הספר. העדכון מותנה ב"עדיין לא התחיל" — עמוד
// שמתנדב קיבל בינתיים שומר את הרצף שלו. מחזיר כמה עמודים עודכנו.
async function resequenceBook(book, { now = new Date(), expectPages = [] } = {}) {
  const pages = await PageProofPage.find({ book: book._id }, PLAN_FIELDS).lean();
  const plan = planSequences(pages, { gid: book.gid, doublePct: book.doublePct, now, expectPages });
  if (!plan.length) return 0;
  const filter = notStartedFilter(now);
  const res = await PageProofPage.bulkWrite(
    plan.map((u) => ({
      updateOne: { filter: { _id: u._id, ...filter }, update: { $set: { seq: u.seq, required: u.required } } },
    })),
    { ordered: false }
  );
  return res.modifiedCount || 0;
}

// links: Map(page → {imagePath, width, height, sitePage}) — עמודים במצב-קישור.
// siteBook: הספר באתר (Book) שממנו התמונות; title: שם להצגה במקום של החבילה.
// expectPages: מספרי-עמודים של הספר שעוד לא נכתבים עכשיו אבל יגיעו (עמודים
// שיועלו אחר כך ב-ZIP) — משתתפים בחישוב הרצפים, כדי שהרצפים יהיו של הספר כולו.
//
// הסיכום לכל ספר: created, updated, recut (הוחלפו בגרסה חדשה אחרי זיהוי-מחדש),
// skippedAnswered, skippedRecut (ממתינים לזיהוי-מחדש, בלי גרסה חדשה בחבילה),
// skippedOlder (בחבילה גרסה ישנה מזו שבאתר), resequenced, linked, errors.
export async function importPackages(
  packages,
  entries,
  { userId, doublePct, links = null, siteBook = null, title: titleOverride = null, expectPages = null } = {}
) {
  const summary = [];
  for (const pkg of packages) {
    const { gid, script } = pkg.meta;
    const title = titleOverride || pkg.meta.title;
    const res = {
      gid,
      title,
      created: 0,
      updated: 0,
      recut: 0,
      skippedAnswered: 0,
      skippedRecut: 0,
      skippedOlder: 0,
      skippedUnexported: 0,
      resequenced: 0,
      errors: [],
    };

    let book = await PageProofBook.findOne({ gid });
    if (!book) {
      book = await PageProofBook.create({
        gid,
        title,
        script,
        doublePct: Number.isFinite(doublePct) ? doublePct : DEFAULT_DOUBLE_PCT,
        importedBy: userId || undefined,
        siteBook: siteBook || undefined,
      });
    } else if (siteBook && !book.siteBook) {
      await PageProofBook.updateOne({ _id: book._id }, { $set: { siteBook } });
    }

    // העמודים השמורים לפי gid (המפתח הייחודי) — כך "קיים" כאן = מה שהכתיבה
    // לפי {gid, page} תפגוש
    const existing = await PageProofPage.find({ gid }, PLAN_FIELDS).lean();
    const existingBy = new Map(existing.map((p) => [p.page, p]));

    // רצף זמני לעמודים חדשים (השדה חובה) — אותו חישוב כמו החלוקה-מחדש
    // שאחרי הכתיבה, כדי שבין לבין לא יוצע רצף מעורבב
    const now = new Date();
    const newPages = pkg.pages.filter(({ doc }) => !existingBy.has(doc.page));
    const provisional = new Map(
      planSequences(
        [
          ...existing,
          ...newPages.map(({ doc }) => ({ _id: `new:${doc.page}`, page: doc.page, seq: null, required: null, revision: incomingRevision(doc) })),
        ],
        { gid, doublePct: book.doublePct, now, expectPages: expectPages || [] }
      ).map((u) => [u._id, u])
    );

    for (const { doc, imagePath } of pkg.pages) {
      let prev = existingBy.get(doc.page);
      // עמוד שממתין לזיהוי-מחדש ובחבילה גרסה חדשה — מוחלף רק אם תיקון-החיתוך
      // המאושר שלו כבר יצא בקובץ-התיקונים (אחרת הגרסה נוצרה בלעדיו)
      if (prev && canReplacePage(prev, doc)) prev = { ...prev, unexportedRecut: await hasUnexportedRecut(prev) };
      const action = importAction(prev, doc);
      if (action === 'skip-answered') {
        res.skippedAnswered++;
        continue;
      }
      if (action === 'skip-recut') {
        res.skippedRecut++;
        continue;
      }
      if (action === 'skip-unexported') {
        res.skippedUnexported++;
        continue;
      }
      if (action === 'skip-older') {
        res.skippedOlder++;
        continue;
      }
      let pending = null;
      try {
        const link = links?.get(doc.page) || null;
        const revision = incomingRevision(doc);
        let img;
        let rel;
        if (link) {
          img = { width: link.width, height: link.height };
          rel = link.imagePath;
        } else {
          img = await toJpeg(entries[imagePath]);
          if (img.width !== doc.size[0] || img.height !== doc.size[1]) {
            res.errors.push(`עמוד ${doc.page}: מידות התמונה (${img.width}×${img.height}) שונות מ-size שבעמוד (${doc.size.join('×')})`);
            continue;
          }
          // התמונה נכנסת למקומה רק אחרי שהעדכון במסד הצליח — עדכון מותנה שנכשל
          // (העמוד הוגש/השתנה בינתיים) לא משאיר את העמוד השמור עם תמונה אחרת
          rel = imageRel(gid, doc.page, revision);
          pending = await writeTemp(rel, img.buffer);
        }

        const content = {
          book: book._id,
          doc,
          lineCount: doc.lines.length,
          imagePath: rel,
          imageWidth: img.width,
          imageHeight: img.height,
          sitePage: link?.sitePage || null,
          revision,
        };

        let done = false;
        if (action === 'create') {
          const first = provisional.get(`new:${doc.page}`) || { seq: 0, required: 1 };
          const r = await PageProofPage.updateOne(
            { gid, page: doc.page },
            {
              $set: content,
              $setOnInsert: {
                seq: first.seq,
                required: first.required,
                activeCount: 0,
                approvedCount: 0,
                submitters: [],
                status: 'open',
              },
            },
            { upsert: true }
          );
          if (r.upsertedCount) res.created++;
          else res.updated++;
          done = true;
        } else if (action === 'update') {
          // מותנה ב"עדיין לא הוגש" — הגשה שנכנסה בינתיים לא תאבד את העמוד שלה
          const r = await PageProofPage.updateOne({ _id: prev._id, ...UNANSWERED_FILTER }, { $set: content });
          if (r.matchedCount) {
            res.updated++;
            done = true;
          } else res.skippedAnswered++;
        } else if (action === 'recut') {
          // מעבר שני: תוכן, גרסה ותמונה חדשים; מונים, מגישים והחכרה מתאפסים.
          // מותנה במצב ובגרסה שנקראו — מנהל שביטל בינתיים את האישור קובע
          const r = await PageProofPage.updateOne(
            { _id: prev._id, status: 'recut', ...revisionFilter(storedRevision(prev)) },
            { $set: { ...content, ...RECUT_RESET } }
          );
          if (r.matchedCount) {
            res.recut++;
            done = true;
          } else res.skippedRecut++;
        }
        if (pending) {
          if (done) await pending.commit();
          else await pending.drop();
          pending = null;
        }
        if (!done) continue;
        // התמונה של הגרסה הקודמת (קובץ אחר) — כבר לא בשימוש. רק תמונה שהייבוא
        // כתב (לא תמונת-ספר מקושרת מהאתר)
        if (action === 'recut' && prev.imagePath && prev.imagePath !== rel && prev.imagePath.startsWith(`${IMAGE_ROOT}/${gid}/`)) {
          await fs.remove(resolveImageFsPath(prev.imagePath)).catch(() => {});
        }
        if (link) res.linked = (res.linked || 0) + 1;
      } catch (e) {
        if (pending) await pending.drop().catch(() => {});
        res.errors.push(`עמוד ${doc.page}: ${e.message}`);
      }
    }

    try {
      res.resequenced = await resequenceBook(book, { expectPages: expectPages || [] });
    } catch (e) {
      res.errors.push(`חלוקה לרצפים: ${e.message}`);
    }

    // מונים של הספר — מחושבים מחדש מהמסד (ייבוא חלקי/חוזר)
    const agg = await PageProofPage.aggregate([
      { $match: { book: book._id } },
      { $group: { _id: null, pages: { $sum: 1 }, lines: { $sum: '$lineCount' } } },
    ]);
    await PageProofBook.updateOne(
      { _id: book._id },
      { $set: { pageCount: agg[0]?.pages || 0, lineCount: agg[0]?.lines || 0, lastImportAt: new Date() } }
    );
    summary.push(res);
  }
  return summary;
}
