import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BookEdit from '@/models/BookEdit';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { canModerateLibrary } from '@/lib/roles';

const PREVIEW_LIMIT = 600;
const clip = (s) => (typeof s === 'string' && s.length > PREVIEW_LIMIT ? s.slice(0, PREVIEW_LIMIT) + '…' : s);

// רשימת הצעות לתור האישורים. תומך בסינון לפי סטטוס/ספר/מחבר/סוג/תבנית.
export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();
    const userDoc = await User.findById(session.user.id).select('role isSupervisor').lean();
    if (!canModerateLibrary(userDoc)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending';
    const bookId = searchParams.get('bookId');
    const authorId = searchParams.get('authorId');
    const kind = searchParams.get('kind');
    const editType = searchParams.get('type');

    const query = { status };
    if (bookId) query.book = bookId;
    if (authorId) query.author = authorId;
    if (kind) query.kind = kind;
    if (editType) query.editType = editType;

    const edits = await BookEdit.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const mapped = edits.map((e) => ({
      _id: e._id,
      book: e.book,
      bookPath: e.bookPath,
      author: e.author,
      authorName: e.authorName,
      status: e.status,
      kind: e.kind,
      editType: e.editType,
      note: e.note,
      findReplace: e.findReplace,
      changeCount: e.changes?.length || 0,
      changes: (e.changes || []).slice(0, 30).map((c) => ({ line: c.line, before: clip(c.before), after: clip(c.after) })),
      baseVersion: e.baseVersion,
      appliedDirectly: e.appliedDirectly,
      reviewerName: e.reviewerName,
      reviewedAt: e.reviewedAt,
      createdAt: e.createdAt,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error('Failed to list edits:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
