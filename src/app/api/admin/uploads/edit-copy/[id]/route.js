import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import UploadEditCopy from '@/models/UploadEditCopy';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';

// עותק עריכה של העלאות (נוצר ב-create-edit-copy) — טעינה, שמירה ומחיקה, למנהלי ספרים בלבד.

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound('עותק העריכה לא נמצא');

    await connectDB();
    const editCopy = await UploadEditCopy.findById(id).populate('createdBy', 'name');
    if (!editCopy) return notFound('עותק העריכה לא נמצא');

    return NextResponse.json(editCopy.toObject(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Failed to fetch edit copy:', error);
    return serverError('שגיאה בטעינת עותק העריכה');
  }
}

export async function PUT(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const content = body?.content;
    if (typeof content !== 'string') return badRequest('חסר תוכן לשמירה');
    if (!mongoose.isValidObjectId(id)) return notFound('עותק העריכה לא נמצא');

    await connectDB();
    const editCopy = await UploadEditCopy.findById(id);
    if (!editCopy) return notFound('עותק העריכה לא נמצא');

    editCopy.content = content;
    editCopy.history.push({
      timestamp: new Date(),
      description: 'עדכון תוכן',
      editorId: session.user._id || session.user.id,
      editorName: session.user.name,
    });
    await editCopy.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save edit copy:', error);
    return serverError('שגיאה בשמירת עותק העריכה');
  }
}

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound('עותק העריכה לא נמצא');

    await connectDB();
    const editCopy = await UploadEditCopy.findById(id);
    if (!editCopy) return notFound('עותק העריכה לא נמצא');

    if (editCopy.sourceUploadIds?.length > 0) {
      await Upload.updateMany(
        { _id: { $in: editCopy.sourceUploadIds } },
        { $unset: { editCopy: '', editCopyCreatedAt: '' } }
      );
    }
    await UploadEditCopy.findByIdAndDelete(id);

    // בלי זה רשימת ההעלאות השמורה במטמון עדיין מציגה "ערוך עותק" לעותק שנמחק
    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete edit copy:', error);
    return serverError('שגיאה במחיקת עותק העריכה');
  }
}
