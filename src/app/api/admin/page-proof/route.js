import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, serverError } from '@/lib/apiResponse';

// GET: רשימת הספרים בהגהת-עמודים עם מוני-התקדמות לכל ספר
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    await connectDB();
    const now = new Date();
    const [books, pageAgg, subAgg] = await Promise.all([
      PageProofBook.find({}).sort({ createdAt: -1 }).lean(),
      PageProofPage.aggregate([
        {
          $group: {
            _id: '$book',
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            double: { $sum: { $cond: [{ $gt: ['$required', 1] }, 1, 0] } },
            leased: { $sum: { $cond: [{ $gt: ['$leasedUntil', now] }, 1, 0] } },
          },
        },
      ]),
      PageProofSubmission.aggregate([
        {
          $group: {
            _id: '$book',
            submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            unexported: {
              $sum: { $cond: [{ $and: [{ $eq: ['$status', 'approved'] }, { $eq: ['$exportedAt', null] }] }, 1, 0] },
            },
          },
        },
      ]),
    ]);
    const pBy = new Map(pageAgg.map((a) => [String(a._id), a]));
    const sBy = new Map(subAgg.map((a) => [String(a._id), a]));
    const out = books.map((b) => {
      const p = pBy.get(String(b._id)) || {};
      const s = sBy.get(String(b._id)) || {};
      return {
        id: String(b._id),
        gid: b.gid,
        title: b.title,
        script: b.script,
        linked: !!b.siteBook,
        status: b.status,
        doublePct: b.doublePct,
        pageCount: b.pageCount,
        lineCount: b.lineCount,
        lastImportAt: b.lastImportAt,
        open: p.open || 0,
        done: p.done || 0,
        double: p.double || 0,
        leased: p.leased || 0,
        submitted: s.submitted || 0,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
        unexported: s.unexported || 0,
      };
    });
    return NextResponse.json({ success: true, books: out }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('admin page-proof GET', e);
    return serverError();
  }
}
