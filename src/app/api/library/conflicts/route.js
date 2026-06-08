import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { diffToHunks, focusChange } from '@/lib/dicta/text-diff';

// רשימת ספרים בקונפליקט סנכרון, כולל diff בין גרסת האתר לגרסת גיטהאב (אדום=גיטהאב, ירוק=האתר)
export async function GET() {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await connectDB();
    const books = await LibraryBook.find(
      { syncStatus: 'conflict' },
      'path title category content conflict updatedAt'
    )
      .sort({ 'conflict.detectedAt': -1 })
      .lean();

    return NextResponse.json(books.map((b) => {
      // before = גיטהאב (theirs), after = האתר (ours) → אדום=גיטהאב, ירוק=האתר
      const theirs = b.conflict?.theirsContent ?? '';
      const ours = b.content || '';
      const hunks = diffToHunks(theirs, ours);
      const changes = hunks.slice(0, 30).map((h) => {
        const f = focusChange(h.before, h.after);
        return { before: f.before, after: f.after };
      });
      return {
        _id: b._id,
        path: b.path,
        title: b.title,
        category: b.category,
        conflictCount: b.conflict?.conflictCount || 0,
        detectedAt: b.conflict?.detectedAt || null,
        changeCount: hunks.length,
        changes,
      };
    }));
  } catch (error) {
    console.error('Failed to list conflicts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
