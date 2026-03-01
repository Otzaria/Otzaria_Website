import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { uploadIds } = await request.json();

  if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
    return NextResponse.json({ error: 'Upload IDs are required' }, { status: 400 });
  }

  await connectDB();

  // שליפת כל ההעלאות
  const uploads = await Upload.find({ 
    _id: { $in: uploadIds },
    isDeleted: false 
  }).sort({ createdAt: 1 }); // מיון לפי תאריך יצירה

  if (uploads.length === 0) {
    return NextResponse.json({ error: 'No uploads found' }, { status: 404 });
  }

  // איחוד כל התוכן
  const combinedContent = uploads.map((upload, index) => {
    const content = upload.content ? upload.content.toString('utf-8') : '';
    const separator = index < uploads.length - 1 ? '\n\n---\n\n' : '';
    return content + separator;
  }).join('');

  return NextResponse.json({ 
    success: true, 
    content: combinedContent,
    bookName: uploads[0].bookName,
    uploadCount: uploads.length
  });
}
