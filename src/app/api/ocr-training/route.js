import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// GET: רשימת עמודי אימון למשתמש — זמינים + אלה שתפוסים על ידו.
// פרמטר ?mine=1 מחזיר רק את שלי.
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await connectDB();
    const userId = session.user.id || session.user._id;
    const { searchParams } = new URL(request.url);
    const mineOnly = searchParams.get('mine') === '1';

    const query = mineOnly
      ? { claimedBy: userId }
      : { $or: [{ status: 'available' }, { claimedBy: userId }] };

    const docs = await OcrTrainingPage.find(query).sort({ updatedAt: -1 }).lean();

    const pages = docs.map((d) => {
      const filled = (d.lines || []).filter((l) => l.text && l.text.trim()).length;
      const mine = d.claimedBy && String(d.claimedBy) === String(userId);
      return {
        id: String(d._id),
        bookName: d.bookName,
        pageNumber: d.pageNumber,
        imagePath: d.imagePath,
        status: d.status,
        scriptType: d.scriptType || 'square',
        targetLines: d.targetLines,
        filledLines: filled,
        mine,
        claimedByName: d.claimedByName || null,
      };
    });

    return NextResponse.json({ success: true, pages });
  } catch (error) {
    console.error('OCR training user list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
