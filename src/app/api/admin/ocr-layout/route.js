import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';

const PAGE_LIMIT = 30;

// GET: רשימת עמודי תיוג-מבנה לניהול, עם עימוד, מוני סטטוסים וסינון.
// פרמטרים: ?status=submitted|approved|available (ברירת מחדל submitted),
// ?batch=…, ?edition=…, ?kind=pagenum|header|streams|zones-full, ?skip=N.
// למנהל גלובלי בלבד — כמו שאר אזורי ה-OCR.
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const status = ['submitted', 'approved', 'available'].includes(searchParams.get('status'))
      ? searchParams.get('status')
      : 'submitted';
    const skip = Math.max(0, parseInt(searchParams.get('skip')) || 0);

    // סינון משותף (בלי סטטוס) — חל גם על מוני הסטטוסים כדי שהטאבים ישקפו אותו
    const filter = {};
    const batch = searchParams.get('batch');
    const edition = searchParams.get('edition');
    const kind = searchParams.get('kind');
    if (batch) filter.batch = String(batch).slice(0, 80);
    if (edition) filter.edition = String(edition).slice(0, 80);
    if (['pagenum', 'header', 'streams', 'zones-full'].includes(kind)) {
      filter['tasks.kind'] = kind;
    }

    const [docs, total, countRows, batches, editions] = await Promise.all([
      OcrLayoutPage.find({ ...filter, status })
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(PAGE_LIMIT)
        .lean(),
      OcrLayoutPage.countDocuments({ ...filter, status }),
      OcrLayoutPage.aggregate([
        { $match: filter },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      OcrLayoutPage.distinct('batch'),
      OcrLayoutPage.distinct('edition'),
    ]);

    const counts = { available: 0, submitted: 0, approved: 0 };
    for (const row of countRows) {
      if (counts[row._id] !== undefined) counts[row._id] = row.n;
    }

    const pages = docs.map((d) => ({
      id: String(d._id),
      status: d.status,
      batch: d.batch,
      edition: d.edition,
      pageStem: d.pageStem,
      imageWidth: d.imageWidth || 0,
      imageHeight: d.imageHeight || 0,
      tasks: (d.tasks || []).map((t) => ({
        kind: t.kind,
        prefill: t.prefill,
        answer: t.answer ?? null,
        confirmed: !!t.confirmed,
      })),
      answeredByName: d.answeredByName || null,
      answeredAt: d.answeredAt || null,
      approvedAt: d.approvedAt || null,
    }));

    return NextResponse.json({
      success: true,
      pages,
      total,
      counts,
      limit: PAGE_LIMIT,
      facets: { batches: batches.sort(), editions: editions.sort() },
    });
  } catch (err) {
    console.error('Admin OCR layout list error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
