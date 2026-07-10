import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';

const PAGE_LIMIT = 50;

// GET: רשימת שורות לניהול לפי סטטוס, עם עימוד ומוני סטטוסים.
// פרמטרים: ?status=submitted|approved|available (ברירת מחדל submitted), ?skip=N
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

    const [docs, total, countRows] = await Promise.all([
      OcrLine.find({ status }).sort({ updatedAt: -1 }).skip(skip).limit(PAGE_LIMIT).lean(),
      OcrLine.countDocuments({ status }),
      OcrLine.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    const counts = { available: 0, submitted: 0, approved: 0 };
    for (const row of countRows) {
      if (counts[row._id] !== undefined) counts[row._id] = row.n;
    }

    const lines = docs.map((d) => ({
      id: String(d._id),
      status: d.status,
      text: d.text || '',
      bookName: d.bookName || '',
      pageNumber: d.pageNumber || 0,
      box: { x: d.x, y: d.y, width: d.width, height: d.height },
      imageWidth: d.imageWidth || 0,
      imageHeight: d.imageHeight || 0,
      transcribedByName: d.transcribedByName || null,
      transcribedAt: d.transcribedAt || null,
      approvedAt: d.approvedAt || null,
      scriptType: d.scriptType === 'rashi' ? 'rashi' : 'square',
      suggestedScriptType: d.suggestedScriptType || null,
    }));

    return NextResponse.json({ success: true, lines, total, counts, limit: PAGE_LIMIT });
  } catch (err) {
    console.error('Admin OCR lines list error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
