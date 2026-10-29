import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import UploadEditCopy from '@/models/UploadEditCopy';
import { hasBooksAccess } from '@/lib/roles';
import { notFound, requireAccess, serverError } from '@/lib/apiResponse';
import { buildAsciiFilename, buildDownloadFilename } from '@/app/library/admin/uploads/edit/[id]/downloadFilename';

// הורדת הגרסה השמורה של עותק עריכה כקובץ טקסט.
export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return notFound('עותק העריכה לא נמצא');

    await connectDB();
    const editCopy = await UploadEditCopy.findById(id).select('title content').lean();
    if (!editCopy) return notFound('עותק העריכה לא נמצא');

    const filename = buildDownloadFilename(editCopy.title);
    const asciiFilename = buildAsciiFilename(filename);

    return new NextResponse(editCopy.content || '', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Failed to download edit copy:', error);
    return serverError('שגיאה בהורדת עותק העריכה');
  }
}
