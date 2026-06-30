import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  chunk,
  uploadFileToGemini,
  deleteUploadedFiles,
  formatEditingInfo,
  buildGeminiParts,
  callGemini,
  matchGeminiResults,
} from '@/lib/ocr/gemini';

// ============================================================
// הגדרות קבועות לעריכה ידנית
// ============================================================

// המודל שאליו נשלחות הבקשות
const GEMINI_MODEL = 'gemini-3.1-pro-preview';

// כמה עמודים מקסימום נשלחים למודל בכל קריאה אחת
const BATCH_SIZE = 5;

// עמודי דוגמא לכל קבוצה.
// כל קבוצה (A/B/C/D) היא רשימה של { bookSlug, pageNumber }.
// העמודים האלו ייקראו מהמסד יחד עם הטקסט הקיים שלהם וישמשו כדוגמא למודל.
// ניתן להוסיף, להסיר או לשנות את ההגדרות לפי הצורך.
//
// בנוסף, אם בפרמטר examples מתקבל "X", הלקוח שולח גם פרמטר customExamples
// (מערך של { bookSlug, pageNumber }) שיתפקד כקבוצת דוגמאות אד-הוק לבקשה זו בלבד.
const EXAMPLE_PAGES = {
  A: [
    { bookSlug: 'עמוד-דוגמא-כתב-רשי-טור-אחד', pageNumber: 1 },
    { bookSlug: 'עמוד-דוגמא-כתב-רשי-טור-אחד-2', pageNumber: 1 },
  ],
  B: [
    { bookSlug: 'עמוד-דוגמא-כתב-רשי-2-טורים', pageNumber: 1 },
    { bookSlug: 'עמוד-דוגמא-כתב-רשי-2-טורים-2', pageNumber: 1 },
  ],
  C: [],
  D: [],
};

// ============================================================

function normalizePagesParam(pages) {
  if (Array.isArray(pages)) {
    return pages
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  if (pages && typeof pages === 'object' && 'from' in pages && 'to' in pages) {
    const from = parseInt(pages.from, 10);
    const to = parseInt(pages.to, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return [];
    const out = [];
    for (let n = from; n <= to; n++) out.push(n);
    return out;
  }
  if (typeof pages === 'number') return [pages];
  return [];
}

async function fetchAndUploadImage(imagePath, requestUrl, apiKey) {
  const imageUrl = new URL(imagePath, requestUrl).toString();
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image ${imagePath} (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime =
    res.headers.get('content-type') ||
    (imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  const displayName = imagePath.split('/').filter(Boolean).pop() || 'page.jpg';
  const uploaded = await uploadFileToGemini({
    buffer: buf,
    mimeType: mime,
    displayName,
    apiKey,
  });
  return { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name };
}

async function loadExamplePagesFromConfig(config, requestUrl, apiKey) {
  if (!Array.isArray(config) || config.length === 0) return [];

  const results = [];
  for (const entry of config) {
    const slug = decodeURIComponent(entry.bookSlug);
    const book = await Book.findOne({ $or: [{ slug }, { name: slug }] }).lean();
    if (!book) {
      console.warn(`[gemini-ocr-batch] example book not found: ${entry.bookSlug}`);
      continue;
    }
    const page = await Page.findOne({ book: book._id, pageNumber: entry.pageNumber }).lean();
    if (!page) {
      console.warn(
        `[gemini-ocr-batch] example page not found: ${entry.bookSlug}#${entry.pageNumber}`
      );
      continue;
    }
    const text = [
      page.content,
      page.rightColumn,
      page.leftColumn,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!text.trim()) {
      console.warn(
        `[gemini-ocr-batch] example page has no text yet: ${entry.bookSlug}#${entry.pageNumber}`
      );
      continue;
    }
    const image = await fetchAndUploadImage(page.imagePath, requestUrl, apiKey);
    results.push({ bookName: book.name, pageNumber: page.pageNumber, image, text });
  }
  return results;
}

function userCanWritePage(page, userId, isAdmin, isBookOwner) {
  if (isAdmin || isBookOwner) return true;
  if (page.status === 'available') return true;
  const claimer = page.claimedBy?.toString();
  return !!claimer && claimer === userId;
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // הגבלת קצב לכל משתמש — קריאות ה-LLM יקרות
    const rlKey = (session.user?._id || session.user?.id || 'unknown').toString();
    if (!checkRateLimit(rlKey, 'gemini-ocr-batch', 10, 'minute')) {
      return NextResponse.json({ error: 'יותר מדי בקשות OCR. נסה שוב בעוד דקה.' }, { status: 429 });
    }

    const apiKey = process.env.GEMINI_BATCH_OCR_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_BATCH_OCR_API_KEY (או GEMINI_API_KEY) לא מוגדר בשרת' },
        { status: 500 }
      );
    }

    const userId = (session?.user?._id || session?.user?.id)?.toString();
    const isAdmin = session.user?.role === 'admin';

    const body = await request.json();
    const { bookPath, pages, customPrompt, examples, customExamples } = body || {};

    if (!bookPath) {
      return NextResponse.json({ error: 'Missing bookPath' }, { status: 400 });
    }
    const pageNumbers = normalizePagesParam(pages);
    if (pageNumbers.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid pages (expected array or {from,to})' },
        { status: 400 }
      );
    }
    if (examples && !['A', 'B', 'C', 'D', 'X'].includes(examples)) {
      return NextResponse.json(
        { error: 'Invalid examples parameter (expected A/B/C/D/X)' },
        { status: 400 }
      );
    }
    if (examples === 'X') {
      if (!Array.isArray(customExamples) || customExamples.length === 0) {
        return NextResponse.json(
          {
            error:
              'When examples="X" you must provide customExamples: [{ bookSlug, pageNumber }, ...]',
          },
          { status: 400 }
        );
      }
      const allValid = customExamples.every(
        (e) =>
          e &&
          typeof e.bookSlug === 'string' &&
          e.bookSlug.length > 0 &&
          Number.isInteger(e.pageNumber) &&
          e.pageNumber > 0
      );
      if (!allValid) {
        return NextResponse.json(
          { error: 'customExamples items must be { bookSlug: string, pageNumber: int }' },
          { status: 400 }
        );
      }
    }

    await connectDB();

    const decodedPath = decodeURIComponent(bookPath);
    const book = await Book.findOne({ $or: [{ slug: decodedPath }, { name: decodedPath }] });
    if (!book) {
      return NextResponse.json({ error: `Book not found: ${decodedPath}` }, { status: 404 });
    }

    const isBookOwner =
      !!book.ownerId && book.ownerId.toString() === userId;

    const dbPages = await Page.find({
      book: book._id,
      pageNumber: { $in: pageNumbers },
    });
    const dbByNumber = new Map(dbPages.map((p) => [p.pageNumber, p]));

    const results = [];
    const workable = [];
    for (const num of pageNumbers) {
      const p = dbByNumber.get(num);
      if (!p) {
        results.push({ pageNumber: num, success: false, error: 'הדף לא נמצא במסד' });
        continue;
      }
      if (!userCanWritePage(p, userId, isAdmin, isBookOwner)) {
        results.push({
          pageNumber: num,
          success: false,
          error: 'אין הרשאת כתיבה לדף זה',
        });
        continue;
      }
      if (!p.imagePath) {
        results.push({ pageNumber: num, success: false, error: 'לא קיים נתיב תמונה' });
        continue;
      }
      workable.push(p);
    }

    if (workable.length === 0) {
      return NextResponse.json({ success: true, results, batches: 0, totalProcessed: 0 });
    }

    // הנחיות עריכה ספציפיות לספר (אם הוגדרו במאגר)
    const bookEditingText = formatEditingInfo(book.editingInfo);

    // טעינת דוגמאות פעם אחת והעלאה ל-Files API. ה-URIs ייעשה בהם שימוש חוזר בכל batch.
    let exampleData = [];
    if (examples) {
      const exampleConfig =
        examples === 'X' ? customExamples : EXAMPLE_PAGES[examples] || [];
      try {
        exampleData = await loadExamplePagesFromConfig(exampleConfig, request.url, apiKey);
      } catch (e) {
        console.error('[gemini-ocr-batch] failed to load examples:', e);
      }
    }

    // נאסוף את כל הקבצים שהעלינו ל-Gemini כדי שנוכל למחוק אותם בסוף (חיסכון במכסה)
    const uploadedFiles = exampleData.map((ex) => ex.image);

    const batches = chunk(workable, BATCH_SIZE);

    for (const batchPages of batches) {
      // הכנת התמונות לכל הדפים בקבוצה: הורדה מהשרת והעלאה ל-Files API
      let batchInputs;
      try {
        batchInputs = await Promise.all(
          batchPages.map(async (p) => ({
            page: p,
            image: await fetchAndUploadImage(p.imagePath, request.url, apiKey),
          }))
        );
        for (const item of batchInputs) uploadedFiles.push(item.image);
      } catch (e) {
        for (const p of batchPages) {
          results.push({
            pageNumber: p.pageNumber,
            success: false,
            error: 'שגיאה בטעינת תמונה: ' + e.message,
          });
        }
        continue;
      }

      let geminiPages;
      try {
        const parts = buildGeminiParts({
          examples: exampleData,
          batch: batchInputs,
          customPrompt,
          bookEditingText,
        });
        geminiPages = await callGemini({ apiKey, model: GEMINI_MODEL, parts });
      } catch (e) {
        for (const p of batchPages) {
          results.push({
            pageNumber: p.pageNumber,
            success: false,
            error: 'שגיאת מודל: ' + e.message,
          });
        }
        continue;
      }

      // התאמת תוצאות לעמודים לפי index (1-based) או לפי הסדר אם חסר
      const texts = matchGeminiResults(geminiPages, batchPages.length);

      for (let i = 0; i < batchPages.length; i++) {
        const p = batchPages[i];
        const text = texts[i];
        if (text == null) {
          results.push({
            pageNumber: p.pageNumber,
            success: false,
            error: 'לא התקבל טקסט עבור עמוד זה מהמודל',
          });
          continue;
        }

        const existing = p.content || '';
        const newContent = existing.trim()
          ? existing + '\n\n' + text
          : text;

        try {
          await Page.findByIdAndUpdate(p._id, { content: newContent });
          results.push({
            pageNumber: p.pageNumber,
            success: true,
            saved: true,
            text,
            appended: !!existing.trim(),
          });
        } catch (e) {
          results.push({
            pageNumber: p.pageNumber,
            success: false,
            error: 'שגיאה בשמירת תוכן: ' + e.message,
            text,
          });
        }
      }
    }

    // ניקוי קבצים שהועלו ל-Gemini Files API. רץ ברקע - לא חוסם את התשובה.
    deleteUploadedFiles(uploadedFiles, apiKey).catch((e) =>
      console.warn('[gemini-ocr-batch] cleanup failed:', e.message)
    );

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      bookSlug: book.slug,
      model: GEMINI_MODEL,
      batches: batches.length,
      totalRequested: pageNumbers.length,
      totalProcessed: successCount,
      uploadedFiles: uploadedFiles.length,
      results,
    });
  } catch (error) {
    console.error('Gemini OCR Batch Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
