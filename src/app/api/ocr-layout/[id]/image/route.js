import { NextResponse } from 'next/server';
import sharp from 'sharp';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { resolveImageFsPath, readPageImage } from '@/lib/ocr/images';
import { requireVerifiedSession } from '@/lib/ocr/layoutPool';

// GET: תמונת העמוד של משימת תיוג-מבנה. ברירת מחדל — העמוד המלא (השכבות
// מצוירות בצד הלקוח לפי ה-prefill, ולכן אסור לשנות את מידות התמונה).
// ?task=N — חיתוך מוגדל לפי המשימה: רצועת מספר-העמוד (pagenum) או הרצועה
// העליונה (header). ?part=pagenum|header — אותם חיתוכים למשימת zones-full.
// מוגש רק למשתמשים מאומתים; התמונות אינן חשופות כנכס סטטי דרך הדף הזה.

// חיתוך רצועת מספר-העמוד: התיבה מה-prefill בהגדלה נדיבה סביבה
function pagenumCrop(prefill, imgW, imgH) {
  const box = prefill?.box;
  if (!box) return null;
  const padX = Math.max(60, Math.round(box.width * 2));
  const padY = Math.max(30, Math.round(box.height * 1.5));
  const left = Math.max(0, Math.round(box.x - padX));
  const top = Math.max(0, Math.round(box.y - padY));
  return {
    left,
    top,
    width: Math.min(imgW - left, Math.round(box.width + 2 * padX)),
    height: Math.min(imgH - top, Math.round(box.height + 2 * padY)),
  };
}

// חיתוך הרצועה העליונה: עד תחתית תיבת-הכותרת או רצועת-ה-y הידועה, במרווח
function headerCrop(prefill, imgW, imgH) {
  const box = prefill?.box;
  const yBand = prefill?.y_band;
  let bottom = 0.2 * imgH; // ברירת מחדל: חמישית עליונה
  if (yBand) bottom = Math.max(bottom, (yBand[1] + 0.05) * imgH);
  if (box) bottom = Math.max(bottom, box.y + box.height + 0.04 * imgH);
  return { left: 0, top: 0, width: imgW, height: Math.min(imgH, Math.round(bottom)) };
}

export async function GET(request, { params }) {
  const { error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const taskIdx = searchParams.get('task');
    const part = searchParams.get('part');

    await connectDB();
    const doc = await OcrLayoutPage.findById(id).lean();
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cacheHeaders = { 'Cache-Control': 'private, max-age=3600' };

    const task = taskIdx !== null ? (doc.tasks || [])[parseInt(taskIdx, 10)] : null;
    if (taskIdx !== null && !task) {
      return NextResponse.json({ error: 'Invalid task index' }, { status: 400 });
    }

    // איזה חיתוך נדרש: לפי סוג המשימה, וב-zones-full לפי part
    let crop = null;
    if (task) {
      const kind = task.kind === 'zones-full' ? part : task.kind;
      const prefill = task.kind === 'zones-full' ? task.prefill?.[part] : task.prefill;
      if (kind === 'pagenum') crop = { fn: pagenumCrop, prefill };
      else if (kind === 'header') crop = { fn: headerCrop, prefill };
    }

    if (!crop) {
      // העמוד המלא כפי שהוא — בלי לגעת במידות
      const { buffer, mimeType } = await readPageImage(doc.imagePath);
      return new NextResponse(buffer, {
        headers: { 'Content-Type': mimeType, ...cacheHeaders },
      });
    }

    // מופע sharp יחיד — הקובץ נקרא ומפוענח פעם אחת ל-metadata ולחיתוך
    const fsPath = resolveImageFsPath(doc.imagePath);
    const image = sharp(fsPath);
    const meta = await image.metadata();
    const imgW = meta.width || doc.imageWidth || 0;
    const imgH = meta.height || doc.imageHeight || 0;

    const region = crop.fn(crop.prefill, imgW, imgH);
    if (!region || region.width < 1 || region.height < 1) {
      // אין תיבת prefill (למשל מספר-עמוד שלא זוהה) — מגישים את העמוד המלא
      const { buffer, mimeType } = await readPageImage(doc.imagePath);
      return new NextResponse(buffer, {
        headers: { 'Content-Type': mimeType, ...cacheHeaders },
      });
    }

    const buf = await image.extract(region).png().toBuffer();
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', ...cacheHeaders },
    });
  } catch (err) {
    console.error('OCR layout image error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
