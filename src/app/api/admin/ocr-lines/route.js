import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';

const PAGE_LIMIT = 50;

// GET: רשימת שורות לניהול לפי סטטוס, עם עימוד ומוני סטטוסים.
// פרמטרים: ?status=submitted|approved|available|flagged (ברירת מחדל submitted),
//           ?pool=all|proofread|legacy (ברירת מחדל all) — הפרדת אצוות-ההגהה
//           (שורות אי-הסכמה מפרויקט ה-OCR, עם batch) מהמאגר הוותיק, ?skip=N
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const status = ['submitted', 'approved', 'available', 'flagged'].includes(searchParams.get('status'))
      ? searchParams.get('status')
      : 'submitted';
    const pool = ['proofread', 'legacy'].includes(searchParams.get('pool'))
      ? searchParams.get('pool')
      : 'all';
    const skip = Math.max(0, parseInt(searchParams.get('skip')) || 0);

    // "מדוגלות" הן תת-קבוצה של available — מוצגות כלשונית נפרדת ומוחרגות ממנה
    const statusFilter =
      status === 'flagged'
        ? { status: 'available', flagged: { $exists: true } }
        : status === 'available'
          ? { status: 'available', flagged: { $exists: false } }
          : { status };
    const poolFilter =
      pool === 'proofread'
        ? { batch: { $exists: true, $ne: null } }
        : pool === 'legacy'
          ? { $or: [{ batch: { $exists: false } }, { batch: null }] }
          : {};
    const filter = { ...statusFilter, ...poolFilter };

    const [docs, total, countRows] = await Promise.all([
      OcrLine.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(PAGE_LIMIT).lean(),
      OcrLine.countDocuments(filter),
      // מונים בחתך המאגר הנבחר, כולל flagged כקטגוריה נפרדת
      OcrLine.aggregate([
        { $match: poolFilter },
        {
          $group: {
            _id: {
              status: '$status',
              // $ne מבטיח ביטוי בוליאני — flagged מכיל מחרוזת, לא boolean
              flagged: { $ne: [{ $ifNull: ['$flagged', null] }, null] },
            },
            n: { $sum: 1 },
          },
        },
      ]),
    ]);

    const counts = { available: 0, submitted: 0, approved: 0, flagged: 0 };
    for (const row of countRows) {
      if (row._id.status === 'available' && row._id.flagged) counts.flagged += row.n;
      else if (counts[row._id.status] !== undefined) counts[row._id.status] += row.n;
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
      // שדות זרימת-ההגהות — לתצוגת ההפרדה בניהול
      batch: d.batch || null,
      flagged: d.flagged || null,
      flaggedByName: d.flaggedByName || null,
      prefill: d.meta?.prefill || d.prefillText || '',
    }));

    return NextResponse.json({ success: true, lines, total, counts, limit: PAGE_LIMIT });
  } catch (err) {
    console.error('Admin OCR lines list error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
