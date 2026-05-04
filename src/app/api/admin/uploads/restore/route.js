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
        $unset: { isDeleted: '', deletedAt: '' }
      },
      { new: true }
    );
    
    if (!result) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Upload restored successfully' });
  } catch (error) {
    console.error('Error restoring upload:', error);
    return NextResponse.json({ error: 'Failed to restore upload' }, { status: 500 });
  }
}
