import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import UploadEditCopy from '@/models/UploadEditCopy';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { uploadIds, bookName } = await request.json();

  if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
    return NextResponse.json({ error: 'Upload IDs are required' }, { status: 400 });
  }

  await connectDB();

  // בדיקה אם כבר קיים עותק עריכה
  const existingUpload = await Upload.findOne({ 
    _id: { $in: uploadIds },
    editCopy: { $exists: true, $ne: null }
  });

  if (existingUpload) {
    return NextResponse.json({ 
      error: 'Edit copy already exists',
      editCopyId: existingUpload.editCopy 
    }, { status: 400 });
  }

  // שליפת כל ההעלאות
  const uploads = await Upload.find({ 
    _id: { $in: uploadIds },
    isDeleted: false 
  }).sort({ createdAt: 1 });

  if (uploads.length === 0) {
    return NextResponse.json({ error: 'No uploads found' }, { status: 404 });
  }

  // איחוד כל התוכן
  const combinedContent = uploads.map((upload, index) => {
    const content = upload.content ? upload.content.toString('utf-8') : '';
    const separator = index < uploads.length - 1 ? '\n\n---\n\n' : '';
    return content + separator;
  }).join('');

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

  return NextResponse.json({ 
    success: true, 
    editCopyId: newEditCopy._id.toString(),
    message: 'עותק העריכה נוצר בהצלחה',
    updatedCount: updateResult.modifiedCount
  });
}
