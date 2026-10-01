import { zipSync, strToU8 } from 'fflate';
import connectDB from '@/lib/db';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { buildFixesFile, splitPrimary, splitFixesFile } from '@/lib/pageProof/fixesExport';
import { needsRecut } from '@/lib/pageProof/ops';
import { storedRevision, submissionRevision } from '@/lib/pageProof/importRules';
import { pageSig } from '@/lib/pageProof/adminReview';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

// GET: תיקונים.json של הספר — רק הגשות מאושרות.
//   ?set=primary (ברירת מחדל) — הגשה אחת לכל עמוד; ?set=double — ההגשות
//   הנוספות של עמודים כפולים (למדידת הסכמה אצל בעל הפרויקט).
//   ?only=new — רק מה שעוד לא יצא; ?mark=1 — סימון ההגשות שיצאו.
//   ?pages=recut — רק עמודים שממתינים עכשיו לזיהוי-מחדש (בגרסה השמורה שלהם): לולאת
//   הזיהוי-מחדש של תוכנת-הספר מושכת בזה את תיקוני-החיתוך המאושרים. עם mark=1 הם
//   מסומנים שיצאו — בלעדיו ייבוא הגרסה החדשה ידלג על העמוד (importRules: skip-unexported).
// ההפרדה ראשית/כפולה נקבעת על כל המאושרות (לא רק החדשות), כדי שהגשה
// שנייה לעמוד שכבר יצא לא תיכנס בטעות לקובץ הראשי; הגשה שמשנה חיתוך קודמת
// (fixesExport.pickPrimary) — העמוד ממתין לזיהוי-מחדש בגללה.
// לכל פעולה: revision, op_id ו-sig (חתימת העמוד בגרסה הזו, כשהעמוד השמור
// עדיין בה) — כדי שתוכנת-הספר תוכל לדלג על פעולה ישנה או כפולה.
// מעל 5,000 פעולות (התקרה שלהם לקובץ אחד) — ZIP של כמה קבצים, בלי לפצל עמוד.
// מפתח-גישה של תוכנת-הספר: read; עם mark=1 (משנה מצב) — גם review.
export async function GET(request, { params }) {
  const sp = new URL(request.url).searchParams;
  const mark = sp.get('mark') === '1';
  const { session, denied: keyDenied } = await getPageProofSession(request, mark ? ['read', 'review'] : 'read');
  if (keyDenied) return keyDenied;
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    const { gid } = await params;
    if (!GID_RE.test(String(gid))) return badRequest('gid לא תקין');
    const set = sp.get('set') === 'double' ? 'double' : 'primary';
    const onlyNew = sp.get('only') === 'new';
    const onlyRecut = sp.get('pages') === 'recut';

    await connectDB();
    const book = await PageProofBook.findOne({ gid }, { title: 1 }).lean();
    if (!book) return notFound('הספר לא נמצא');

    const approved = await PageProofSubmission.find(
      { gid, status: 'approved' },
      { pageNo: 1, revision: 1, who: 1, ops: 1, reviewedAt: 1, createdAt: 1, exportedAt: 1, needsRecut: 1 }
    ).lean();
    const shaped = approved.map((s) => ({
      _id: s._id,
      page: s.pageNo,
      // מעבר שני של עמוד שחזר מזיהוי-מחדש — ראשי לגרסה שלו (fixesExport)
      revision: s.revision,
      who: s.who,
      ops: s.ops,
      needsRecut: !!s.needsRecut || needsRecut(s.ops),
      approvedAt: s.reviewedAt,
      submittedAt: s.createdAt,
      exportedAt: s.exportedAt,
    }));
    let chosen = splitPrimary(shaped)[set].filter((s) => !onlyNew || !s.exportedAt);
    if (onlyRecut) {
      // הגשות של הגרסה השמורה בלבד — מצב 'recut' שייך לגרסה הזו
      const waiting = await PageProofPage.find({ gid, status: 'recut' }, { page: 1, revision: 1 }).lean();
      const keys = new Set(waiting.map((p) => `${p.page}:${storedRevision(p)}`));
      chosen = chosen.filter((s) => keys.has(`${s.page}:${submissionRevision(s)}`));
    }

    // חתימות-העמודים (מזהי-השורות והגודל) — רק לעמודים שבקובץ, בלי ה-doc הכבד
    const sigs = new Map();
    const pageNos = [...new Set(chosen.map((s) => s.page))];
    if (pageNos.length) {
      const pages = await PageProofPage.find({ gid, page: { $in: pageNos } }, { page: 1, revision: 1, 'doc.lines.id': 1, 'doc.size': 1 }).lean();
      for (const p of pages) sigs.set(`${p.page}:${storedRevision(p)}`, pageSig(p));
    }
    const files = splitFixesFile(buildFixesFile(gid, chosen, new Date(), sigs));

    if (mark && chosen.length) {
      await PageProofSubmission.updateMany({ _id: { $in: chosen.map((s) => s._id) } }, { $set: { exportedAt: new Date() } });
    }

    const name = `תיקונים${set === 'double' ? '-כפולים' : ''}-${book.title}`.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    const headers = { 'Cache-Control': 'private, no-store', 'X-Submission-Count': String(chosen.length), 'X-Fixes-Files': String(files.length) };
    if (files.length === 1) {
      return new Response(JSON.stringify(files[0], null, 1), {
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="fixes.json"; filename*=UTF-8''${encodeURIComponent(name)}.json`,
        },
      });
    }
    const entries = Object.fromEntries(files.map((f, i) => [`${name}-${i + 1}.json`, strToU8(JSON.stringify(f, null, 1))]));
    return new Response(zipSync(entries), {
      headers: {
        ...headers,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="fixes.zip"; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
      },
    });
  } catch (e) {
    console.error('page-proof fixes', e);
    return serverError();
  }
}
