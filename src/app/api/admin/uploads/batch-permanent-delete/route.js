import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return badRequest('Upload IDs array is required');
    }

    await connectDB();
    
    const result = await Upload.deleteMany({ _id: { $in: uploadIds } });

    return NextResponse.json({ 
      success: true, 
      message: 'Uploads permanently deleted',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error permanently deleting uploads:', error);
    return serverError('Failed to permanently delete uploads');
  }
}
