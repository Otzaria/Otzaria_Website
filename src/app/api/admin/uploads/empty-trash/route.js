import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { requireAccess, serverError } from '@/lib/apiResponse';

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBooksAccess);
  if (denied) return denied;

  try {
    await connectDB();

    const result = await Upload.deleteMany({ isDeleted: true });

    return NextResponse.json({
      success: true,
      message: 'Trash emptied successfully',
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error emptying trash:', error);
    return serverError('Failed to empty trash');
  }
}
