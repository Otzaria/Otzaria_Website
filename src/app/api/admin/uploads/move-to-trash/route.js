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
    const { uploadId } = await request.json();
    
    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 });
    }

    await connectDB();
       
    const result = await Upload.findByIdAndUpdate(
      uploadId,
      { 
        isDeleted: true,
        deletedAt: new Date()
      },
      { new: true }
    );
    
    if (!result) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Upload moved to trash',
      upload: {
        id: result._id,
        isDeleted: result.isDeleted,
        deletedAt: result.deletedAt
      }
    });
  } catch (error) {
    console.error('Error moving upload to trash:', error);
    return NextResponse.json({ error: 'Failed to move upload to trash' }, { status: 500 });
  }
}
