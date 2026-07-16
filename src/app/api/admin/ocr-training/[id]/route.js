import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';

// DELETE: מחיקת עמוד אימון מהמאגר.
export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { id } = await params;
    await connectDB();
    const res = await OcrTrainingPage.findByIdAndDelete(id);
    if (!res) return NextResponse.json({ success: false, error: 'לא נמצא' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training delete error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH: פעולות ניהול. גוף: { action: 'release' } — משחרר שיוך משתמש ומחזיר ל-available.
export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
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
        { new: true }
      );
      if (!doc) return NextResponse.json({ success: false, error: 'לא נמצא' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (error) {
    console.error('OCR training patch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
