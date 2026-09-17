import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
      return badRequest('Upload IDs array is required');
    }

    await connectDB();
    
    const result = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      { 
        isDeleted: true,
        deletedAt: new Date()
      }
    );

    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({
      success: true,
      message: 'Uploads moved to trash',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error moving uploads to trash:', error);
    return serverError('Failed to move uploads to trash');
  }
}
