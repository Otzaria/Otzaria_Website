import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import MailingList from '@/models/MailingList';
import { hasBookLibraryAccess } from '@/lib/roles';

const LIST_NAME = 'new_books_subscribers';

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasBookLibraryAccess(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden: Access denied' }, { status: 403 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    await connectDB();

    await MailingList.updateOne(
      { listName: LIST_NAME },
      { $pull: { emails: email } }
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Admin Delete Subscriber Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete subscriber' }, { status: 500 });
  }
}