import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import PageProofSubmission from '@/models/PageProofSubmission';
import PageProofBook from '@/models/PageProofBook';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, serverError } from '@/lib/apiResponse';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

const PAGE_SIZE = 50;
const STATUSES = ['submitted', 'approved', 'rejected'];

// GET: תור ההגשות. ?status=submitted|approved|rejected ?gid= ?page=N (עימוד)
// בלי הפעולות עצמן — רק מונים, כדי שהרשימה תהיה קלה (עם הפעולות, לפי עמוד:
// books/[gid]/submissions). גם במפתח-גישה של תוכנת-הספר (read).
export async function GET(request) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'read');
  if (keyDenied) return keyDenied;
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    const status = STATUSES.includes(sp.get('status')) ? sp.get('status') : 'submitted';
    const gid = sp.get('gid');
    const pageNum = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const filter = { status };
    if (gid && /^[A-Za-z0-9]{8,64}$/.test(gid)) filter.gid = gid;

    await connectDB();
    const [items, total, counts] = await Promise.all([
      PageProofSubmission.find(filter, { ops: 0 })
        .sort(status === 'submitted' ? { createdAt: 1 } : { reviewedAt: -1 })
        .skip((pageNum - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      PageProofSubmission.countDocuments(filter),
      PageProofSubmission.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const books = await PageProofBook.find({ _id: { $in: [...new Set(items.map((i) => String(i.book)))] } }, { title: 1 }).lean();
    const titleOf = new Map(books.map((b) => [String(b._id), b.title]));
    return NextResponse.json(
      {
        success: true,
        total,
        pageSize: PAGE_SIZE,
        counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
        items: items.map((s) => ({
          id: String(s._id),
          gid: s.gid,
          title: titleOf.get(String(s.book)) || '',
          pageNo: s.pageNo,
          userName: s.userName,
          opCount: s.opCount,
          // משנה את חיתוך-השורות — אישור יחזיר את העמוד לזיהוי-מחדש
          needsRecut: !!s.needsRecut,
          // בקשת מתנדב לזיהוי-מחדש (לא הגשה) — adminReview.submissionDetail
          recutRequest: !!s.recutRequest,
          revision: s.revision ?? 1,
          note: s.note,
          status: s.status,
          createdAt: s.createdAt,
          reviewedAt: s.reviewedAt,
          reviewedByName: s.reviewedByName,
          reviewNote: s.reviewNote,
          exportedAt: s.exportedAt,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof submissions GET', e);
    return serverError();
  }
}
