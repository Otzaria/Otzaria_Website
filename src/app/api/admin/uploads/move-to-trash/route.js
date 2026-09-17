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
        isDeleted: true,
        deletedAt: new Date()
      },
      { returnDocument: 'after' }
    );
    
    if (!result) {
      return notFound('Upload not found');
    }

    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

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
    return serverError('Failed to move upload to trash');
  }
}
