import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return badRequest('Upload IDs array is required');
    }

    await connectDB();
    
    const result = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      // isDeleted: false ולא $unset: הרשימה (/api/admin/uploads/list, עמוד ההעלאות והמונים)
      // מסננת לפי isDeleted: false, ומסמך בלי השדה לא מתאים לתנאי הזה — העלאה ששוחזרה
      // נעלמה גם מהרשימה וגם מהאשפה. deletedAt נמחק כמו קודם.
      // העלאות שכבר שוחזרו כך לפני התיקון (בלי השדה) — לא מתוקנות כאן; ראו
      // https://github.com/Otzaria/Otzaria_Website/issues/241
      {
        $set: { isDeleted: false },
        $unset: { deletedAt: '' }
      }
    );

    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({
      success: true,
      message: 'Uploads restored successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error restoring uploads:', error);
    return serverError('Failed to restore uploads');
  }
}
