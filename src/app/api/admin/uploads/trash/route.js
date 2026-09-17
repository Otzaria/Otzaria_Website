import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { requireAccess } from '@/lib/apiResponse';

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

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
