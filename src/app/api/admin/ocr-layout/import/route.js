import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { unzipSync } from 'fflate';
import connectDB from '@/lib/db';
import OcrLayoutPage from '@/models/OcrLayoutPage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { validatePrefill, TASK_KINDS } from '@/lib/ocr/layoutValidation';

// פריקת אצווה יכולה לקחת זמן (מאות תמונות לדיסק)
export const maxDuration = 300;

const MAX_ZIP_BYTES = 500 * 1024 * 1024; // תואם את proxyClientMaxBodySize
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
  if (!isAdmin(session?.user?.role)) {
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

      const { batch, edition, page, width, height, tasks } = rec || {};
      if (!SAFE_ID.test(String(batch)) || !SAFE_ID.test(String(edition)) || !SAFE_ID.test(String(page))) {
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

      // התמונה חייבת להיות באצווה — מהדורות הקורפוס אינן "ספרים" באתר
      const zipImagePath = `images/${edition}/${page}.jpg`;
      const imageData = entries[zipImagePath];
      if (!imageData || !imageData.length) {
        fail(`${edition}/${page}: התמונה ${zipImagePath} חסרה ב-ZIP`);
        continue;
      }

      const key = { batch, edition, pageStem: page };
      const existing = await OcrLayoutPage.findOne(key).select('status').lean();
      if (existing && existing.status !== 'available') {
        // עמוד שכבר נענה: לא דורסים תשובה של מתנדב ולא את התמונה שראו
        summary.skippedAnswered += 1;
        continue;
      }

      const imagePath = `/uploads/ocr-layout/${batch}/${edition}/${page}.jpg`;
      const fsPath = resolveImageFsPath(imagePath); // כולל אימות traversal
      await fs.ensureDir(path.dirname(fsPath));
      await fs.writeFile(fsPath, Buffer.from(imageData));

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
