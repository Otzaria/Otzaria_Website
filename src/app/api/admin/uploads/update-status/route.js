import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { CACHE_TAGS } from '@/lib/cacheTags';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  revalidateTag(CACHE_TAGS.UPLOADS_ADMIN_LIST);

  return NextResponse.json({ success: true, upload });
}