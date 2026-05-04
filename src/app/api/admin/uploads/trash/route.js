import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectDB();
  
  // מציג רק העלאות שבאשפה
  const uploads = await Upload.find({ isDeleted: true })
    .populate('uploader', 'name')
    .sort({ deletedAt: -1 });

  const formattedUploads = uploads.map(u => ({
      id: u._id,
      bookName: u.bookName,
      originalFileName: u.originalFileName,
      uploadedBy: u.uploader?.name,
      uploadedAt: u.createdAt,
      deletedAt: u.deletedAt,
      uploadType: u.uploadType || 'single_page',
  }));

  return NextResponse.json({ success: true, uploads: formattedUploads });
}
