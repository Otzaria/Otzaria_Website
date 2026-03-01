import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await connectDB();
  
  // מציג רק העלאות שלא באשפה
  const uploads = await Upload.find({ isDeleted: false })
    .populate('uploader', 'name')
    .sort({ createdAt: -1 });

  // התאמה ל-UI
  const formattedUploads = uploads.map(u => ({
      id: u._id.toString(),
      bookName: u.bookName,
      originalFileName: u.originalFileName,
      uploadedBy: u.uploader?.name,
      uploadedAt: u.createdAt,
      uploadType: u.uploadType || 'single_page', // ברירת מחדל לרשומות ישנות
      status: u.status,
      bookStatus: u.bookStatus || 'not_checked', // סטטוס הספר
      editCopy: u.editCopy ? u.editCopy.toString() : null, // מזהה עותק העריכה
      editCopyCreatedAt: u.editCopyCreatedAt, // תאריך יצירת עותק העריכה
  }));

  return NextResponse.json({ success: true, uploads: formattedUploads });
}
