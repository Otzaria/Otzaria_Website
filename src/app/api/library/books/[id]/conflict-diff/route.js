import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { diffToHunks, focusChange } from '@/lib/dicta/text-diff';

// diff בין גרסת האתר לגרסת גיטהאב לספר בודד בקונפליקט (אדום=גיטהאב, ירוק=האתר).
// נטען לפי דרישה כדי לא לחשב diff על כל הספרים בבת אחת בעמוד הקונפליקטים.
export async function GET(req, { params }) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    await connectDB();
    const book = await LibraryBook.findById(id, 'content conflict syncStatus').lean();
    if (!book) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

    // ללא ולידציה זו, id תקין של ספר שאינו בקונפליקט יחזיר diff מטעה מול מחרוזת ריקה
    if (book.syncStatus !== 'conflict' || book.conflict?.theirsContent == null) {
      return NextResponse.json({ error: 'Book is not in conflict' }, { status: 409 });
    }

    // before = גיטהאב (theirs), after = האתר (ours) → אדום=גיטהאב, ירוק=האתר
    const theirs = book.conflict?.theirsContent ?? '';
    const ours = book.content || '';
    const hunks = diffToHunks(theirs, ours);
    // before/after = גרסה ממוקדת לתצוגה; fullBefore/fullAfter = התוכן המלא של ה-hunk,
    // שנשלח חזרה בהכרעה מקטע-מקטע כדי לזהות את המקטע לפי תוכן (ללא תלות באינדקס).
    const changes = hunks.slice(0, 30).map((h) => {
      const f = focusChange(h.before, h.after);
      return { before: f.before, after: f.after, fullBefore: h.before, fullAfter: h.after };
    });

    return NextResponse.json({ changeCount: hunks.length, changes });
  } catch (error) {
    console.error('Failed to compute conflict diff:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
