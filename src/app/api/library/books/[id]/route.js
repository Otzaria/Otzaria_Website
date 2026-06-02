import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import BookEdit from '@/models/BookEdit';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { canEditLibraryDirectly } from '@/lib/roles';
import { submitManualEdit } from '@/lib/dicta/library-service';

// טעינת ספר לעריכה: תוכן + מטא + מצב ההרשאה של המשתמש + הצעתו הממתינה (אם יש)
export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectDB();

    const book = await LibraryBook.findById(id).lean();
    if (!book) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 });

    const userDoc = await User.findById(session.user.id).select('role isSupervisor dictaEditBlocked name').lean();
    const canEditDirect = canEditLibraryDirectly(userDoc);

    // הצעה ידנית ממתינה של המשתמש הנוכחי (טיוטה פתוחה)
    const myPending = await BookEdit.findOne({
      book: id,
      author: session.user.id,
      status: 'pending',
      kind: 'manual',
    }).select('changes baseVersion updatedAt').lean();

    return NextResponse.json({
      _id: book._id,
      path: book.path,
      title: book.title,
      category: book.category,
      content: book.content || '',
      version: book.version,
      syncStatus: book.syncStatus,
      pendingCount: book.pendingCount,
      blocked: !!userDoc?.dictaEditBlocked,
      canEditDirect,
      myPending: myPending || null,
    });
  } catch (error) {
    console.error('Failed to load library book:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// הגשת עריכה ידנית (תוכן מלא). מפקח/מנהל → מוחל מיד; רגיל → הצעה ממתינה.
export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { content, editType, note, baseVersion } = body;

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'חסר תוכן' }, { status: 400 });
    }

    await connectDB();
    const userDoc = await User.findById(session.user.id).select('role isSupervisor dictaEditBlocked name');
    if (!userDoc) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 401 });

    const result = await submitManualEdit({ bookId: id, userDoc, newContent: content, editType, note, baseVersion });
    return NextResponse.json(result);
  } catch (error) {
    if (error.code === 'BLOCKED') return NextResponse.json({ error: error.message, code: 'BLOCKED' }, { status: 403 });
    if (error.code === 'STALE') return NextResponse.json({ error: error.message, code: 'STALE', currentVersion: error.currentVersion }, { status: 409 });
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Failed to submit library edit:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
