import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { uploadIds } = await request.json();
    
    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return NextResponse.json({ error: 'Upload IDs array is required' }, { status: 400 });
    }

    await connectDB();
    
    const result = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      { 
        $unset: { isDeleted: '', deletedAt: '' }
      }
    );

    return NextResponse.json({ 
      success: true, 
      message: 'Uploads restored successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error restoring uploads:', error);
    return NextResponse.json({ error: 'Failed to restore uploads' }, { status: 500 });
  }
}
