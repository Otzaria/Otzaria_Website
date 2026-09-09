import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';

// PUT - עדכון סטטוס מרובה
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadIds, bookStatus } = await request.json();

    if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0 || !bookStatus) {
      return badRequest('Upload IDs array and book status are required');
    }

    await connectDB();
    
    const result = await Upload.updateMany(
      { _id: { $in: uploadIds } },
      { bookStatus }
    );
    
    revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

    return NextResponse.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error batch updating book status:', error);
    return serverError('Failed to batch update book status');
  }
}
