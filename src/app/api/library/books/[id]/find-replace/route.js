import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { submitFindReplaceEdit } from '@/lib/dicta/library-service';
import { unauthorized, badRequest, notFound, serverError } from '@/lib/apiResponse';

// חיפוש-והחלפה (כולל regex) כתיקון. מפקח/מנהל → מוחל מיד; רגיל → הצעה ממתינה.
export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const { id } = await params;
    const { find, replace, isRegex, flags, caseSensitive, editType, note } = await req.json();

    await connectDB();
    const userDoc = await User.findById(session.user.id).select('role isSupervisor dictaEditBlocked name');
    if (!userDoc) return unauthorized('משתמש לא נמצא');

    const result = await submitFindReplaceEdit({
      bookId: id, userDoc, find, replace, isRegex, flags, caseSensitive, editType, note,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error.code === 'BLOCKED') return NextResponse.json({ error: error.message, code: 'BLOCKED' }, { status: 403 });
    if (error.code === 'BAD_INPUT') return badRequest(error.message);
    if (error.code === 'NOT_FOUND') return notFound(error.message);
    console.error('Failed find-replace edit:', error);
    return serverError();
  }
}
