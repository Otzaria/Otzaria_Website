import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { unauthorized, forbidden, notFound, serverError } from '@/lib/apiResponse';

// POST: תפיסת עמוד אימון. רק משתמשים מאומתים (isVerified).
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  const isAdmin = hasBookLibraryAccess(session.user.role);
  if (!session.user.isVerified && !isAdmin) {
    return forbidden('רק משתמשים מאומתים יכולים לתפוס עמודי אימון');
  }

  try {
    const { id } = await params;
    const userId = session.user.id || session.user._id;
    await connectDB();

    const oid = new mongoose.Types.ObjectId(userId);
    const updates = {
      status: 'in-progress',
      claimedBy: oid,
      claimedByName: session.user.name,
      claimedAt: new Date(),
      $unset: { completedAt: '' },
    };

    // תפיסה אטומית: מצליחה רק אם העמוד זמין או כבר שלי — מונע מירוץ בין שני משתמשים.
    const claimFilter = { _id: id, $or: [{ status: 'available' }, { claimedBy: oid }] };
    let doc = await OcrTrainingPage.findOneAndUpdate(claimFilter, updates, { returnDocument: 'after' });

    if (!doc) {
      const existing = await OcrTrainingPage.findById(id).select('_id claimedBy');
      if (!existing) return notFound('העמוד לא נמצא');
      if (isAdmin) {
        // אדמין רשאי לעקוף שיוך קיים
        doc = await OcrTrainingPage.findByIdAndUpdate(id, updates, { returnDocument: 'after' });
      } else {
        return NextResponse.json(
          { success: false, error: 'העמוד כבר תפוס על ידי משתמש אחר' },
          { status: 409 }
        );
      }
    }

    revalidateNow(CACHE_TAGS.OCR_TRAINING_LIST);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training claim error:', error);
    return serverError();
  }
}
