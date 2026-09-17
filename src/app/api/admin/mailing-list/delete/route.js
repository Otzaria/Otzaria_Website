import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import MailingList from '@/models/MailingList';
import { hasBookLibraryAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';

const LIST_NAME = 'new_books_subscribers';

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { email } = await request.json();

    if (!email) {
      return badRequest('Email is required');
    }

    await connectDB();

    await MailingList.updateOne(
      { listName: LIST_NAME },
      { $pull: { emails: email } }
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Admin Delete Subscriber Error:', error);
    return serverError('Failed to delete subscriber');
  }
}