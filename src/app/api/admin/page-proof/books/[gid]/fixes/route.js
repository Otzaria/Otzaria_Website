import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofBook from '@/models/PageProofBook';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { buildFixesFile, splitPrimary } from '@/lib/pageProof/fixesExport';

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

// GET: תיקונים.json של הספר — רק הגשות מאושרות.
//   ?set=primary (ברירת מחדל) — הגשה אחת לכל עמוד; ?set=double — ההגשות
//   הנוספות של עמודים כפולים (למדידת הסכמה אצל בעל הפרויקט).
//   ?only=new — רק מה שעוד לא יצא; ?mark=1 — סימון ההגשות שיצאו.
// ההפרדה ראשית/כפולה נקבעת על כל המאושרות (לא רק החדשות), כדי שהגשה
// שנייה לעמוד שכבר יצא לא תיכנס בטעות לקובץ הראשי.
export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    const { gid } = await params;
    if (!GID_RE.test(String(gid))) return badRequest('gid לא תקין');
    const sp = new URL(request.url).searchParams;
    const set = sp.get('set') === 'double' ? 'double' : 'primary';
    const onlyNew = sp.get('only') === 'new';
    const mark = sp.get('mark') === '1';

    await connectDB();
    const book = await PageProofBook.findOne({ gid }, { title: 1 }).lean();
    if (!book) return notFound('הספר לא נמצא');

    const approved = await PageProofSubmission.find(
      { gid, status: 'approved' },
      { pageNo: 1, who: 1, ops: 1, reviewedAt: 1, createdAt: 1, exportedAt: 1 }
    ).lean();
    const shaped = approved.map((s) => ({
      _id: s._id,
      page: s.pageNo,
      who: s.who,
      ops: s.ops,
      approvedAt: s.reviewedAt,
      submittedAt: s.createdAt,
      exportedAt: s.exportedAt,
    }));
    const chosen = splitPrimary(shaped)[set].filter((s) => !onlyNew || !s.exportedAt);
    const file = buildFixesFile(gid, chosen);

    if (mark && chosen.length) {
      await PageProofSubmission.updateMany({ _id: { $in: chosen.map((s) => s._id) } }, { $set: { exportedAt: new Date() } });
    }

    const name = `תיקונים${set === 'double' ? '-כפולים' : ''}-${book.title}`.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    return new Response(JSON.stringify(file, null, 1), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="fixes.json"; filename*=UTF-8''${encodeURIComponent(name)}.json`,
        'Cache-Control': 'private, no-store',
        'X-Submission-Count': String(chosen.length),
      },
    });
  } catch (e) {
    console.error('page-proof fixes', e);
    return serverError();
  }
}
