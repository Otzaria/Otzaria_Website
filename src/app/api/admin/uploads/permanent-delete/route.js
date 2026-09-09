import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    const { uploadId } = await request.json();

    if (!uploadId) {
      return badRequest('Upload ID is required');
    }

    await connectDB();

    const result = await Upload.findByIdAndDelete(uploadId);

    if (!result) {
      return notFound('Upload not found');
    }

    return NextResponse.json({ success: true, message: 'Upload permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting upload:', error);
    return serverError('Failed to permanently delete upload');
  }
}
