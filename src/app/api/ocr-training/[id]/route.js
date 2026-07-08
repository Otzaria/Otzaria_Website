import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// מרכיב את הטקסט השמור במערכת לעמוד זה (מהתמלול הרגיל), לעזרה למסמן.
function buildSavedText(p) {
  if (!p) return '';
  if (p.isTwoColumns) {
    const r = (p.rightColumnName || 'טור א') + ':\n' + (p.rightColumn || '');
    const l = (p.leftColumnName || 'טור ב') + ':\n' + (p.leftColumn || '');
    return [r, l].join('\n\n').trim();
  }
  return (p.content || '').trim();
}

// GET: טעינת עמוד אימון בודד (תמונה, מידות, שורות קיימות).
export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    await connectDB();
    const doc = await OcrTrainingPage.findById(id).lean();
    if (!doc) return NextResponse.json({ success: false, error: 'העמוד לא נמצא' }, { status: 404 });

    const userId = session.user.id || session.user._id;
    const mine = doc.claimedBy && String(doc.claimedBy) === String(userId);

    // טקסט שמור במערכת לאותו ספר+עמוד (מהתמלול הרגיל), אם קיים — לעזרה בעבודה
    let savedText = '';
    try {
      const src = await Page.findOne({ book: doc.book, pageNumber: doc.pageNumber })
        .select('content isTwoColumns rightColumn leftColumn rightColumnName leftColumnName')
        .lean();
      savedText = buildSavedText(src);
    } catch {
      savedText = '';
    }

    return NextResponse.json({
      success: true,
      page: {
        id: String(doc._id),
        bookName: doc.bookName,
        pageNumber: doc.pageNumber,
        imagePath: doc.imagePath,
        imageWidth: doc.imageWidth,
        imageHeight: doc.imageHeight,
        scriptType: doc.scriptType || 'square',
        rotation: doc.rotation || 0,
        savedText,
        targetLines: doc.targetLines,
        status: doc.status,
        mine,
        claimedByName: doc.claimedByName || null,
        lines: (doc.lines || []).map((l) => ({
          index: l.index,
          x: l.x,
          y: l.y,
          width: l.width,
          height: l.height,
          text: l.text || '',
        })),
      },
    });
  } catch (error) {
    console.error('OCR training get error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
