import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { requireAccess } from '@/lib/apiResponse';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  const { uploadId, status } = await request.json(); // 'approved' / 'rejected'
  
  await connectDB();

  const upload = await Upload.findByIdAndUpdate(
      uploadId,
      { 
          status, 
          reviewedBy: session.user._id 
      },
      { returnDocument: 'after' }
  );

  revalidateNow(CACHE_TAGS.UPLOADS_ADMIN_LIST);

  return NextResponse.json({ success: true, upload });
}