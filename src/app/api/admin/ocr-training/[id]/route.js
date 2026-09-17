import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';

// DELETE: מחיקת עמוד אימון מהמאגר.
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    const { id } = await params;
    await connectDB();
    const res = await OcrTrainingPage.findByIdAndDelete(id);
    if (!res) return notFound();
    revalidateNow(CACHE_TAGS.OCR_TRAINING_LIST);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training delete error:', error);
    return serverError();
  }
}

// PATCH: פעולות ניהול. גוף: { action: 'release' } — משחרר שיוך משתמש ומחזיר ל-available.
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  try {
    const { id } = await params;
    const { action } = await request.json();
    await connectDB();

    if (action === 'release') {
      const doc = await OcrTrainingPage.findByIdAndUpdate(
        id,
        {
          status: 'available',
          $unset: { claimedBy: '', claimedByName: '', claimedAt: '', completedAt: '' },
        },
        { returnDocument: 'after' }
      );
      if (!doc) return notFound();
      revalidateNow(CACHE_TAGS.OCR_TRAINING_LIST);
      return NextResponse.json({ success: true });
    }

    return badRequest('פעולה לא מוכרת');
  } catch (error) {
    console.error('OCR training patch error:', error);
    return serverError();
  }
}
