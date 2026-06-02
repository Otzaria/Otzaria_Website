import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { submitFindReplaceEdit } from '@/lib/dicta/library-service';

// חיפוש-והחלפה (כולל regex) כתיקון. מפקח/מנהל → מוחל מיד; רגיל → הצעה ממתינה.
export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { find, replace, isRegex, flags, caseSensitive, editType, note } = await req.json();

    await connectDB();
    const userDoc = await User.findById(session.user.id).select('role isSupervisor dictaEditBlocked name');
    if (!userDoc) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 401 });

    const result = await submitFindReplaceEdit({
      bookId: id, userDoc, find, replace, isRegex, flags, caseSensitive, editType, note,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error.code === 'BLOCKED') return NextResponse.json({ error: error.message, code: 'BLOCKED' }, { status: 403 });
    if (error.code === 'BAD_INPUT') return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Failed find-replace edit:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
