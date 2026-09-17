import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadId } = await request.json();

    if (!uploadId) {
      return badRequest('Upload ID is required');
    }

    await connectDB();
    
    const result = await Upload.findByIdAndUpdate(
      uploadId,
      { 
        $unset: { isDeleted: '', deletedAt: '' }
      },
      { returnDocument: 'after' }
    );
    
    if (!result) {
      return notFound('Upload not found');
    }

    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({ success: true, message: 'Upload restored successfully' });
  } catch (error) {
    console.error('Error restoring upload:', error);
    return serverError('Failed to restore upload');
  }
}
