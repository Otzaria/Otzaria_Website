import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { unauthorized, forbidden, notFound, serverError } from '@/lib/apiResponse';

// POST: המשתמש משחרר עמוד שתפס (מוותר עליו). השורות שסומנו נשמרות.
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBookLibraryAccess(session.user.role);

    await connectDB();
    const page = await OcrTrainingPage.findById(id);
    if (!page) return notFound('העמוד לא נמצא');

    const isOwner = page.claimedBy && page.claimedBy.toString() === String(userId);
    if (!isOwner && !isAdmin) {
      return forbidden('העמוד אינו משויך אליך');
    }

    page.status = 'available';
    page.claimedBy = undefined;
    page.claimedByName = undefined;
    page.claimedAt = undefined;
    page.completedAt = undefined;
    await page.save();

    revalidateNow(CACHE_TAGS.OCR_TRAINING_LIST);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training release error:', error);
    return serverError();
  }
}
