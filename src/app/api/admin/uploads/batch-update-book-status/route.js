import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { hasBooksAccess } from '@/lib/roles';

// PUT - עדכון סטטוס מרובה
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { uploadIds, bookStatus } = await request.json();
    
    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0 || !bookStatus) {
      return NextResponse.json({ error: 'Upload IDs array and book status are required' }, { status: 400 });
    }

    await connectDB();
    
    const result = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      { bookStatus }
    );
    
    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error batch updating book status:', error);
    return NextResponse.json({ error: 'Failed to batch update book status' }, { status: 500 });
  }
}
