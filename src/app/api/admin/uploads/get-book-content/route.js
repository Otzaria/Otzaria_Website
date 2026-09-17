import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';
import { hasBooksAccess } from '@/lib/roles';
import { combineUploadsContent } from '@/lib/uploadContent';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return badRequest('Upload IDs are required');
    }

    await connectDB();

    // שליפת כל ההעלאות
    const uploads = await Upload.find({
      _id: { $in: uploadIds },
      isDeleted: false
    }).sort({ createdAt: 1 }); // מיון לפי תאריך יצירה

    if (uploads.length === 0) {
      return notFound('No uploads found');
    }

    // איחוד כל התוכן
    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    const combinedContent = combineUploadsContent(parts);

    return NextResponse.json({
      success: true,
      content: combinedContent,
      bookName: uploads[0].bookName,
      uploadCount: uploads.length
    });
  } catch (error) {
    console.error('Error getting book content:', error);
    return serverError('Failed to get book content');
  }
}
