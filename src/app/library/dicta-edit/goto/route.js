import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';

/**
 * קישור עמוק ממערכת דיווח השגיאות של אוצריא (ומכל מקור חיצוני):
 *   /library/dicta-edit/goto?title=שם הספר&text=הקטע המדווח
 *
 * מתרגם שם ספר (כפי שמופיע באוצריא — שם הקובץ ללא סיומת) למזהה הספר במרחב
 * העריכה, ומפנה ישירות לעורך עם פרמטר find למיקוד הקטע.
 * כשאין התאמה חד-משמעית (הספר לא נמצא / שני ספרים באותו שם בקטגוריות שונות)
 * מפנים לרשימת הספרים מסוננת לפי השם — ההתנהגות הקיימת של פרמטר q.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || searchParams.get('q') || '').trim();
  const text = (searchParams.get('text') || searchParams.get('find') || '').trim();

  const listUrl = new URL('/library/dicta-edit', req.url);
  if (title) listUrl.searchParams.set('q', title);
  // גם במסלול ה-fallback משמרים את הקטע — הרשימה תעביר אותו לעורך שייבחר
  if (text) listUrl.searchParams.set('find', text);
  if (!title) return NextResponse.redirect(listUrl);

  try {
    await connectDB();
    // title בספר כולל את נתיב הקטגוריות ("הלכה/אחרונים/דרך החיים") — מתאימים
    // לפי הסגמנט האחרון. limit(2) מספיק כדי לזהות עמימות.
    // regex-suffix לא מנצל אינדקס — סביר לאוסף של מאות ספרים; אם יגדל
    // משמעותית, לשקול שדה basename מאונדקס.
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = await LibraryBook.find(
      { removedUpstream: { $ne: true }, title: { $regex: `(^|/)${escaped}$` } },
      '_id'
    ).limit(2).lean();

    if (matches.length === 1) {
      const editUrl = new URL(`/library/dicta-edit/${matches[0]._id}`, req.url);
      if (text) editUrl.searchParams.set('find', text);
      return NextResponse.redirect(editUrl);
    }
  } catch (error) {
    console.error('Failed to resolve dicta-edit goto link:', error);
  }

  return NextResponse.redirect(listUrl);
}
