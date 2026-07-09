import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';

// POST: המשתמש משחרר עמוד שתפס (מוותר עליו). השורות שסומנו נשמרות.
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBookLibraryAccess(session.user.role);

    await connectDB();
    const page = await OcrTrainingPage.findById(id);
    if (!page) return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });

    const isOwner = page.claimedBy && page.claimedBy.toString() === String(userId);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: 'העמוד אינו משויך אליך' }, { status: 403 });
    }

    page.status = 'available';
    page.claimedBy = undefined;
    page.claimedByName = undefined;
    page.claimedAt = undefined;
    page.completedAt = undefined;
    await page.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training release error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
