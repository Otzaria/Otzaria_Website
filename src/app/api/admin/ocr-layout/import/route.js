import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { unzipSync } from 'fflate';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { validatePrefill, TASK_KINDS } from '@/lib/ocr/layoutValidation';

// פריקת אצווה יכולה לקחת זמן (מאות תמונות לדיסק)
export const maxDuration = 300;

// תקרת זיכרון: unzipSync פורק את כל ה-ZIP לזיכרון בבת אחת. מצב-הקישור
// (ref לתמונת-ספר קיימת) הפך אצוות-תמונות כבדות למיותרות — אצווה טיפוסית
// היא מטא-דאטה בלבד — ולכן רף בטוח מפני OOM, ולא 500mb של הפרוקסי הכללי.
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_RECORDS = 20000;

// מזהי אצווה/מהדורה/עמוד: ASCII בטוח לנתיב, בלי אפשרות traversal
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

// POST: ייבוא אצוות תיוג-מבנה — ZIP שהפיק scripts/export_labeling_batch.py
// בפרויקט OCR-AI: tasks.jsonl (שורה לעמוד) + images/<edition>/<stem>.jpg.
// התמונות נפרקות אל /uploads/ocr-layout/<batch>/… והעמודים נכתבים כמסמכי
// OcrLayoutPage. ייבוא חוזר של אותה אצווה = upsert לפי המפתח הייחודי:
// עמוד שכבר נענה (submitted/approved) לא נדרס — נספר כ"דולג".
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasOcrAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ success: false, error: 'חובה להעלות קובץ ZIP' }, { status: 400 });
    }
    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json({ success: false, error: 'קובץ גדול מדי (מקסימום 500MB)' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let entries;
    try {
      entries = unzipSync(bytes);
    } catch {
      return NextResponse.json({ success: false, error: 'קובץ ZIP לא תקין' }, { status: 400 });
    }

    const tasksFile = entries['tasks.jsonl'];
    if (!tasksFile) {
      return NextResponse.json(
        { success: false, error: 'לא נמצא tasks.jsonl בשורש ה-ZIP — זו אינה אצוות תיוג-מבנה' },
        { status: 400 }
      );
    }

    const lines = new TextDecoder().decode(tasksFile).split('\n').filter((l) => l.trim());
    if (!lines.length || lines.length > MAX_RECORDS) {
      return NextResponse.json({ success: false, error: 'מספר רשומות לא תקין ב-tasks.jsonl' }, { status: 400 });
    }

    await connectDB();

    const summary = {
      pages: 0,
      created: 0,
      updated: 0,
      skippedAnswered: 0,
      byKind: { pagenum: 0, header: 0, streams: 0, 'zones-full': 0 },
      errors: [],
    };

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const fail = (msg) => {
        if (summary.errors.length < 20) summary.errors.push(`שורה ${lineNo + 1}: ${msg}`);
      };

      let rec;
      try {
        rec = JSON.parse(lines[lineNo]);
      } catch {
        fail('JSON לא תקין');
        continue;
      }

      const { batch, edition, page, width, height, tasks, ref } = rec || {};
      // בלי הבדיקה המפורשת לקיום: String(undefined)==="undefined" עובר את
      // SAFE_ID ומזהם את המסד/הדיסק בערכי "undefined"
      if (!batch || !edition || !page ||
          !SAFE_ID.test(String(batch)) || !SAFE_ID.test(String(edition)) || !SAFE_ID.test(String(page))) {
        fail('מזהה אצווה/מהדורה/עמוד לא תקין');
        continue;
      }
      if (!Number.isInteger(width) || !Number.isInteger(height) ||
          width < 50 || height < 50 || width > 20000 || height > 20000) {
        fail('מידות תמונה לא תקינות');
        continue;
      }
      if (!Array.isArray(tasks) || !tasks.length || tasks.length > 6) {
        fail('רשימת משימות חסרה או גדולה מדי');
        continue;
      }

      // ולידציית המשימות וה-prefill — הצד השני של הוולידציה הכפולה
      let taskErr = null;
      const cleanTasks = [];
      for (const t of tasks) {
        if (!t || !TASK_KINDS.includes(t.kind)) {
          taskErr = 'סוג משימה לא מוכר';
          break;
        }
        taskErr = validatePrefill(t.kind, t.prefill, width, height);
        if (taskErr) break;
        cleanTasks.push({ kind: t.kind, prefill: t.prefill, answer: null, confirmed: false });
      }
      if (taskErr) {
        fail(`${edition}/${page}: ${taskErr}`);
        continue;
      }

      // שני מצבים: (א) מצב-קישור — לרשומה יש ref לעמוד-ספר קיים, מצביעים
      // לתמונת-הספר בלי להעלות תמונה כפולה; (ב) תמונה מצורפת ב-ZIP.
      // ‏prefill במצב-קישור כבר במרחב הסריקה המקורית (הופכי ה-deskew נעשה
      // בייצוא), ולכן מתלבש על תמונת-הספר הלא-מיושרת.
      // בדיקת ref/זמינות התמונה לפני בדיקת "כבר נענה", כדי להיכשל מוקדם;
      // כתיבת קובץ (מצב ב') נעשית רק אחרי שווידאנו שהעמוד אינו נענה.
      const linkFields = {};
      let zipImageData = null;
      let imagePath;
      if (ref) {
        if (!/^[a-fA-F0-9]{24}$/.test(String(ref.bookId)) ||
            !Number.isInteger(ref.pageNumber) || ref.pageNumber <= 0) {
          fail(`${edition}/${page}: ref לא תקין (bookId/pageNumber)`);
          continue;
        }
        const src = await Page.findOne({
          book: new mongoose.Types.ObjectId(String(ref.bookId)),
          pageNumber: ref.pageNumber,
        }).select('imagePath').lean();
        if (!src?.imagePath) {
          fail(`${edition}/${page}: עמוד-ספר לקישור לא נמצא (book ${ref.bookId} עמ' ${ref.pageNumber})`);
          continue;
        }
        imagePath = src.imagePath;
        linkFields.book = new mongoose.Types.ObjectId(String(ref.bookId));
        linkFields.bookSlug = ref.slug ? String(ref.slug) : undefined;
        linkFields.pageNumber = ref.pageNumber;
      } else {
        // מהדורות הקורפוס אינן "ספרים" באתר — התמונה חייבת להיות ב-ZIP
        const zipImagePath = `images/${edition}/${page}.jpg`;
        zipImageData = entries[zipImagePath];
        if (!zipImageData || !zipImageData.length) {
          fail(`${edition}/${page}: התמונה ${zipImagePath} חסרה ב-ZIP`);
          continue;
        }
        imagePath = `/uploads/ocr-layout/${batch}/${edition}/${page}.jpg`;
      }

      const key = { batch, edition, pageStem: page };
      const existing = await OcrLayoutPage.findOne(key).select('status').lean();
      if (existing && existing.status !== 'available') {
        // עמוד שכבר נענה: לא דורסים תשובה של מתנדב ולא את התמונה שראו
        summary.skippedAnswered += 1;
        continue;
      }

      // מצב תמונה-ב-ZIP: כותבים לדיסק רק עכשיו (אחרי שהעמוד אינו נענה)
      if (zipImageData) {
        const fsPath = resolveImageFsPath(imagePath); // כולל אימות traversal
        await fs.ensureDir(path.dirname(fsPath));
        await fs.writeFile(fsPath, Buffer.from(zipImageData));
      }

      // התנאי על הסטטוס גם בעדכון עצמו: מתנדב שהגיש בין הבדיקה לכתיבה לא
      // יידרס — ההתאמה תיכשל, ה-upsert יתנגש במפתח הייחודי ויידלג.
      try {
        await OcrLayoutPage.updateOne(
          { ...key, status: 'available' },
          {
            $set: {
              imagePath,
              imageWidth: width,
              imageHeight: height,
              tasks: cleanTasks,
              status: 'available',
              ...linkFields,
            },
            $unset: { leasedUntil: '' },
          },
          { upsert: true }
        );
      } catch (e) {
        if (e?.code === 11000) {
          summary.skippedAnswered += 1;
          continue;
        }
        throw e;
      }

      summary.pages += 1;
      if (existing) summary.updated += 1;
      else summary.created += 1;
      for (const t of cleanTasks) summary.byKind[t.kind] += 1;
    }

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error('Admin OCR layout import error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
