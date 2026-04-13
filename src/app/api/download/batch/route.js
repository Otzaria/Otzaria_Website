import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const { uploadIds } = await request.json();
    
    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return NextResponse.json({ error: 'Upload IDs array is required' }, { status: 400 });
    }

    await connectDB();
    
    // שליפת כל הקבצים
    const uploads = await Upload.find({ _id: { $in: uploadIds } });
    
    if (uploads.length === 0) {
      return NextResponse.json({ error: 'No files found' }, { status: 404 });
    }

    // איחוד התוכן של כל הקבצים עם 2 מעברי שורות ביניהם
    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    const combinedContent = parts.join('\n\n');

    // החזרת הקובץ המאוחד
    return new NextResponse(combinedContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="combined_uploads_${new Date().toISOString().split('T')[0]}.txt"`
      }
    });

  } catch (error) {
    console.error('Error downloading batch:', error);
    return NextResponse.json({ error: 'Failed to download batch' }, { status: 500 });
  }
}
