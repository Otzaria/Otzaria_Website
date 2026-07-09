import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import sharp from 'sharp';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { validateLine, LINES_PER_PAGE } from '@/lib/ocr/trainingValidation';
import { rotatedSize } from '@/lib/ocr/geometry';

// POST: סימון עמוד אימון כהושלם.
// דורש בדיוק LINES_PER_PAGE שורות תקינות: תיבה בתוך גבולות התמונה + טקסט חוקי באלפבית.
export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBookLibraryAccess(session.user.role);

    await connectDB();
    const page = await OcrTrainingPage.findById(id);
    if (!page) return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });

    const isOwner = page.claimedBy && page.claimedBy.toString() === String(userId);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: 'העמוד אינו משויך אליך' }, { status: 403 });
    }

    // תמיד קוראים את קובץ התמונה — גם אם המידות כבר שמורות — כדי לוודא שהוא עדיין
    // קריא (אחרת הייצוא ידלג על העמוד למרות שהוא "הושלם").
    let imgW = page.imageWidth || 0;
    let imgH = page.imageHeight || 0;
    try {
      const meta = await sharp(resolveImageFsPath(page.imagePath)).metadata();
      if (!imgW || !imgH) {
        imgW = meta.width || 0;
        imgH = meta.height || 0;
        if (imgW && imgH) {
          page.imageWidth = imgW;
          page.imageHeight = imgH;
        }
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'לא ניתן לקרוא את תמונת העמוד — לא ניתן להשלים. נסו שוב מאוחר יותר.' },
        { status: 422 }
      );
    }

    // אם עדיין אין מידות תקינות — חוסמים השלמה
    if (!imgW || !imgH) {
      return NextResponse.json(
        { success: false, error: 'תמונת העמוד אינה תקינה — לא ניתן לאמת את השורות.' },
        { status: 422 }
      );
    }

    // התיבות נשמרות במרחב התמונה המסובבת — מאמתים מול מידות ה"בד" המסובב
    const rot = rotatedSize(imgW, imgH, page.rotation || 0);

    const lines = page.lines || [];
    const invalid = lines
      .map((l, i) => ({ i, res: validateLine(l, rot.w, rot.h) }))
      .filter((x) => !x.res.ok);
    const validCount = lines.length - invalid.length;
    const required = page.targetLines || LINES_PER_PAGE;

    if (lines.length > required) {
      return NextResponse.json(
        { success: false, error: `יש בדיוק ${lines.length} שורות מסומנות; נדרשות בדיוק ${required}. מחקו שורות עודפות.` },
        { status: 400 }
      );
    }
    if (validCount !== required) {
      const reasons = invalid.map((x) => `שורה ${x.i + 1}: ${x.res.reason}`).slice(0, 5)
      return NextResponse.json(
        {
          success: false,
          error: `נדרשות בדיוק ${required} שורות תקינות (תקינות: ${validCount}).` +
            (reasons.length ? ' בעיות: ' + reasons.join('; ') : ''),
          invalidLines: invalid.map((x) => ({ index: x.i, reason: x.res.reason })),
        },
        { status: 400 }
      );
    }

    page.status = 'completed';
    page.completedAt = new Date();
    await page.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR training complete error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
