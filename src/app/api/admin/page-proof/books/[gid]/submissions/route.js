import connectDB from '@/lib/db';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { editorPageShape } from '@/lib/pageProof/pool';
import { pageSig, pageWindow, submissionDetail } from '@/lib/pageProof/adminReview';
import { json, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

// GET: ההגשות של ספר אחד לפי עמוד — עם הפעולות ועם העמוד השמור שעליו הן חלות, בבקשה
// אחת (לתצוגת "לפני/אחרי" בתוכנת-הספר; תור-ההגשות הכללי — submissions — בלי הפעולות).
//   ?status=submitted (ברירת מחדל) | approved | rejected
//   ?after=<מספר-עמוד> — להמשך (העמוד האחרון בתשובה הקודמת; next בתשובה)
//   ?limit=N — עמודים בתשובה (ברירת מחדל 10, עד 25)
// ← {success, gid, title, script, status, total (עמודים עם הגשות במצב הזה), next,
//    pages: [{page: {id, gid, page, seq, required, revision, title, script, imageUrl, doc,
//                    status, sig}, submissions: [{id, status, userName, who, ops, note, createdAt,
//                    reviewedByName, reviewedAt, reviewNote, reviewerEdited, exportedAt,
//                    needsRecut, revision}]}]}
// submission.revision שונה מ-page.revision — ההגשה נעשתה על גרסה קודמת של העמוד (האתר
// שומר רק את הגרסה הנוכחית). page.sig — כמו sig בקובץ-התיקונים. imageUrl — לדפדפן בלבד.
// רק מנהל OCR — גם במפתח-גישה של תוכנת-הספר (read). private, no-store.

const GID_RE = /^[A-Za-z0-9]{8,64}$/;
const STATUSES = ['submitted', 'approved', 'rejected'];
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const intParam = (v) => (v !== null && /^\d{1,6}$/.test(v) ? Number(v) : null);

export async function GET(request, { params }) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'read');
  if (keyDenied) return noStore(keyDenied);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  try {
    const { gid } = await params;
    if (!GID_RE.test(String(gid))) return noStore(badRequest('gid לא תקין'));
    const sp = new URL(request.url).searchParams;
    const status = STATUSES.includes(sp.get('status')) ? sp.get('status') : 'submitted';
    const after = intParam(sp.get('after'));
    const limit = Math.min(MAX_LIMIT, Math.max(1, intParam(sp.get('limit')) ?? DEFAULT_LIMIT));

    await connectDB();
    const book = await PageProofBook.findOne({ gid }, { title: 1, script: 1 }).lean();
    if (!book) return noStore(notFound('הספר לא נמצא'));

    const win = pageWindow(await PageProofSubmission.distinct('pageNo', { gid, status }), { after, limit });
    const [subs, pages] = win.pages.length
      ? await Promise.all([
          PageProofSubmission.find({ gid, status, pageNo: { $in: win.pages } }).sort({ pageNo: 1, createdAt: 1 }).lean(),
          PageProofPage.find({ gid, page: { $in: win.pages } }).lean(),
        ])
      : [[], []];
    const pageBy = new Map(pages.map((p) => [p.page, p]));
    const out = win.pages
      .filter((n) => pageBy.has(n))
      .map((n) => {
        const p = pageBy.get(n);
        return {
          page: { ...editorPageShape(p, book), status: p.status, sig: pageSig(p) },
          submissions: subs.filter((s) => s.pageNo === n).map(submissionDetail),
        };
      });
    return json({ success: true, gid, title: book.title, script: book.script || null, status, total: win.total, next: win.next, pages: out });
  } catch (e) {
    console.error('admin page-proof book submissions GET', e);
    return noStore(serverError());
  }
}
