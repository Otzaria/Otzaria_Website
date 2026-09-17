import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import UploadEditCopy from '@/models/UploadEditCopy';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { combineUploadsContent } from '@/lib/uploadContent';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds, bookName } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return badRequest('Upload IDs are required');
    }

    await connectDB();

    // בדיקה אם כבר קיים עותק עריכה
    const existingUpload = await Upload.findOne({
      _id: { $in: uploadIds },
      editCopy: { $exists: true, $ne: null }
    });

    if (existingUpload) {
      return badRequest('Edit copy already exists');
    }

    // שליפת כל ההעלאות
    const uploads = await Upload.find({
      _id: { $in: uploadIds },
      isDeleted: false
    }).sort({ createdAt: 1 });

    if (uploads.length === 0) {
      return notFound('No uploads found');
    }

    // איחוד כל התוכן
    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    const combinedContent = combineUploadsContent(parts);

    // יצירת עותק עריכה חדש
    const newEditCopy = new UploadEditCopy({
      title: bookName || uploads[0].bookName,
      content: combinedContent,
      status: 'available',
      sourceUploadIds: uploadIds, // שמירת מזהי ההעלאות המקוריות
      createdBy: session.user.id
    });

    await newEditCopy.save();

    // עדכון ההעלאות עם מזהה עותק העריכה
    const updateResult = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      {
        $set: {
          editCopy: newEditCopy._id,
          editCopyCreatedAt: new Date()
        }
      }
    );

    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({
      success: true,
      editCopyId: newEditCopy._id.toString(),
      message: 'עותק העריכה נוצר בהצלחה',
      updatedCount: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Error creating edit copy:', error);
    return serverError('Failed to create edit copy');
  }
}
