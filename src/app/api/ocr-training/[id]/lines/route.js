import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { unauthorized, forbidden, notFound, serverError } from '@/lib/apiResponse';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// PUT: שמירת שורות מסומנות (autosave). גוף: { lines: [{x,y,width,height,text}] }
// רק המשתמש שתפס את העמוד (או אדמין) רשאי לשמור.
export async function PUT(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();

  try {
    const { id } = await params;
    const { lines, rotation } = await request.json();
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBookLibraryAccess(session.user.role);

    await connectDB();
    const page = await OcrTrainingPage.findById(id);
    if (!page) return notFound('העמוד לא נמצא');

    const isOwner = page.claimedBy && page.claimedBy.toString() === String(userId);
    if (!isOwner && !isAdmin) {
      return forbidden('עליך לתפוס את העמוד לפני עריכה');
    }

    const clean = (Array.isArray(lines) ? lines : [])
      .filter((l) => l && num(l.width) > 0 && num(l.height) > 0)
      .map((l, i) => ({
        index: i,
        x: Math.max(0, num(l.x)),
        y: Math.max(0, num(l.y)),
        width: num(l.width),
        height: num(l.height),
        text: typeof l.text === 'string' ? l.text : '',
      }));

    page.lines = clean;
    if (Number.isFinite(Number(rotation))) {
      // מגבילים לטווח סביר של יישור עדין
      page.rotation = Math.max(-45, Math.min(45, Number(rotation)));
    }
    // עריכה לאחר השלמה מבטלת את האישור — חוזרים ל-in-progress כדי לחייב אימות מחדש,
    // כך שלא ניתן לשנות ground truth ועדיין להורידו כ-completed.
    if (page.status === 'completed') {
      page.status = 'in-progress';
      page.completedAt = undefined;
    }
    await page.save();

    // בכוונה בלי revalidateTag כאן: זהו autosave שרץ בתדירות גבוהה מאוד
    // (כמעט בכל הקלדה/גרירה), ולא משנה אילו עמודים נחשבים "זמינים" עבור
    // משתמשים אחרים (status הופך ל-'available' רק דרך claim/release/admin,
    // שכן מבוטלים בנפרד). זו אותה חריגה בדיוק כמו downloadCount המתועדת
    // ב-src/lib/cacheTags.js — ביטול מטמון על כל שמירה בודדת כאן היה מבטל
    // את התועלת של המטמון; חלון ה-revalidate הרגיל (OCR_TRAINING_LIST)
    // מספיק כרשת ביטחון לעדכון תצוגת ההתקדמות/סטטוס בעמוד שלי.
    const filled = clean.filter((l) => l.text && l.text.trim()).length;
    return NextResponse.json({ success: true, markedLines: clean.length, filledLines: filled });
  } catch (error) {
    console.error('OCR training save lines error:', error);
    return serverError();
  }
}
