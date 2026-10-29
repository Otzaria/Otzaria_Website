import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import UploadEditCopy from '@/models/UploadEditCopy';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';
import { hasBooksAccess } from '@/lib/roles';
import { combineUploadsContent } from '@/lib/uploadContent';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

// איפוס עותק עריכה: איחוד מחדש של תוכן ההעלאות המקוריות (שלא נמחקו).
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound('עותק העריכה לא נמצא');

    await connectDB();
    const editCopy = await UploadEditCopy.findById(id);
    if (!editCopy) return notFound('עותק העריכה לא נמצא');

    if (!editCopy.sourceUploadIds?.length) {
      return badRequest('לא נמצאו העלאות מקוריות לאיפוס');
    }

    const uploads = await Upload.find({
      _id: { $in: editCopy.sourceUploadIds },
      isDeleted: false,
    }).sort({ createdAt: 1 });

    if (uploads.length === 0) {
      return notFound('ההעלאות המקוריות נמחקו או לא נמצאו');
    }

    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    editCopy.content = combineUploadsContent(parts);
    editCopy.history.push({
      timestamp: new Date(),
      description: `איפוס מ-${uploads.length} העלאות מקוריות`,
      editorId: session.user._id || session.user.id,
      editorName: session.user.name,
    });
    await editCopy.save();

    return NextResponse.json({
      success: true,
      message: `עותק העריכה אופס בהצלחה מ-${uploads.length} העלאות מקוריות`,
      book: editCopy.toObject(),
    });
  } catch (error) {
    console.error('Failed to reset edit copy:', error);
    return serverError('שגיאה באיפוס עותק העריכה');
  }
}
