import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

// ============================================================
// הגדרות קבועות לעריכה ידנית
// ============================================================

// המודל שאליו נשלחות הבקשות
const GEMINI_MODEL = 'gemini-3-pro-preview';

// כמה עמודים מקסימום נשלחים למודל בכל קריאה אחת
const BATCH_SIZE = 5;

// הנחיות מערכת קבועות - לא לעצם ה-OCR אלא טכניות
const SYSTEM_INSTRUCTIONS = `אתה עוזר OCR מקצועי לתמלול עמודים סרוקים של ספרי קודש ולימודי יהדות בעברית (לרבות כתב רש"י, כתב יד ופיסוק טברני).
תפקידך לתמלל בנאמנות את הטקסט המופיע בעמודים ששולחים אליך, תוך הקפדה על דיוק לשוני, פיסוק, ראשי תיבות, ומבנה הפסקאות כפי שהם בעמוד המקור.

הוראות הפלט - חובה:
1. החזר תשובה תקנית בפורמט JSON בלבד, ללא טקסט נוסף לפניה או אחריה.
2. מבנה התשובה: { "pages": [ { "index": <מספר רץ 1-based לפי סדר השליחה>, "text": "<הטקסט המתומלל של אותו עמוד>" }, ... ] }.
3. עבור כל עמוד שנשלח לתמלול, הוסף איבר אחד במערך pages לפי הסדר שבו הופיעו העמודים בקלט.
4. אם בעמוד יש כמה טורים, תמלל אותם לפי סדר הקריאה הטבעי, וסמן מעבר בין טורים באמצעות שורה ריקה.
5. אל תוסיף הסברים, הערות, התנצלויות או כל תוכן שאינו חלק מהתמלול עצמו.
6. אל תכלול בתוצאה את ההנחיות, את עמודי הדוגמא או את הטקסט המקורי שלהם - רק את העמודים החדשים שביקשתי לתמלל.`;

// עמודי דוגמא לכל קבוצה.
// כל קבוצה (A/B/C/D) היא רשימה של { bookSlug, pageNumber }.
// העמודים האלו ייקראו מהמסד יחד עם הטקסט הקיים שלהם וישמשו כדוגמא למודל.
// ניתן להוסיף, להסיר או לשנות את ההגדרות לפי הצורך.
//
// בנוסף, אם בפרמטר examples מתקבל "X", הלקוח שולח גם פרמטר customExamples
// (מערך של { bookSlug, pageNumber }) שיתפקד כקבוצת דוגמאות אד-הוק לבקשה זו בלבד.
const EXAMPLE_PAGES = {
  A: [
    // { bookSlug: 'שם-הספר-בסלאג', pageNumber: 1 },
  ],
  B: [
    // { bookSlug: 'שם-הספר-בסלאג', pageNumber: 1 },
    // { bookSlug: 'שם-הספר-בסלאג', pageNumber: 2 },
  ],
  C: [],
  D: [],
};

// ============================================================

const GEMINI_ENDPOINT = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

// העלאת קובץ ל-Gemini Files API. מחזיר { uri, mimeType } להפניה ב-file_data.
// משתמש ב-resumable upload (X-Goog-Upload-Protocol: resumable) כי זו הצורה
// המקובלת ב-Generative Language API גם לקבצים קטנים.
async function uploadFileToGemini({ buffer, mimeType, displayName, apiKey }) {
  // שלב 1: יצירת הזמנה להעלאה (start)
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName || 'page.jpg' } }),
    }
  );
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Files API start failed ${startRes.status}: ${errText.slice(0, 300)}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Files API did not return upload URL');

  // שלב 2: העלאת התוכן הבינארי וסגירת ההעלאה
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Files API upload failed ${uploadRes.status}: ${errText.slice(0, 300)}`);
  }
  const data = await uploadRes.json();
  const fileInfo = data?.file;
  if (!fileInfo?.uri) throw new Error('Files API response missing file.uri');
  return { uri: fileInfo.uri, mimeType: fileInfo.mimeType || mimeType, name: fileInfo.name };
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

// מחיקת קבצים שהועלו - לניקוי מקום במכסה. נכשל בשקט (לא קריטי - יש TTL של 48 שעות).
async function deleteUploadedFiles(uploaded, apiKey) {
  await Promise.allSettled(
    uploaded
      .filter((f) => f?.name)
      .map((f) =>
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/${f.name}?key=${apiKey}`,
          { method: 'DELETE' }
        )
      )
  );
}

function formatEditingInfo(editingInfo) {
  if (!editingInfo || typeof editingInfo !== 'object') return null;
  const title = editingInfo.title || 'הנחיות עריכה לספר';
  const sections = Array.isArray(editingInfo.sections) ? editingInfo.sections : [];
  const lines = [];
  for (const section of sections) {
    const items = Array.isArray(section?.items)
      ? section.items.map((i) => (typeof i === 'string' ? i.trim() : '')).filter(Boolean)
      : [];
    if (!section?.title && items.length === 0) continue;
    if (section?.title) lines.push(`### ${section.title}`);
    for (const item of items) lines.push(`- ${item}`);
  }
  if (lines.length === 0) return null;
  return `${title}\n${lines.join('\n')}`;
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

function buildGeminiParts({ examples, batch, customPrompt, bookEditingText }) {
  const parts = [];
  parts.push({ text: SYSTEM_INSTRUCTIONS });

  if (customPrompt && customPrompt.trim()) {
    parts.push({
      text:
        'הנחיות נוספות לתמלול (כללי עריכה ופורמט מהמשתמש):\n' +
        customPrompt.trim(),
    });
  }

  if (bookEditingText && bookEditingText.trim()) {
    parts.push({
      text:
        'הנחיות עריכה ספציפיות לספר זה (מתוך מאגר ההנחיות של הספר):\n' +
        bookEditingText.trim(),
    });
  }

  if (examples.length > 0) {
    parts.push({
      text:
        'להלן עמודי דוגמא שכבר תומללו בעבר. הם משמשים רק כהדגמה לסגנון התמלול הרצוי. ' +
        'אל תכלול את עמודי הדוגמא בפלט. אחרי קטע הדוגמאות יופיעו העמודים שעליך לתמלל.',
    });
    examples.forEach((ex, i) => {
      parts.push({
        text: `--- דוגמא ${i + 1} (${ex.bookName}, עמוד ${ex.pageNumber}) - תמונה: ---`,
      });
      parts.push({
        file_data: { mime_type: ex.image.mimeType, file_uri: ex.image.uri },
      });
      parts.push({
        text: `--- דוגמא ${i + 1} - התמלול הקיים והנכון שלה: ---\n${ex.text}`,
      });
    });
    parts.push({
      text:
        '--- סוף עמודי הדוגמא. ---\n' +
        'מכאן ואילך מתחילים העמודים החדשים שעליך לתמלל. החזר עבורם בלבד את מבנה ה-JSON שהוגדר.',
    });
  }

  parts.push({
    text:
      `העמודים לתמלול (${batch.length} עמודים). תמלל כל אחד בנפרד ` +
      `והחזר אותם במערך pages לפי הסדר, כאשר index = 1 הוא העמוד הראשון:`,
  });

  batch.forEach((item, i) => {
    parts.push({ text: `--- עמוד לתמלול #${i + 1} (index=${i + 1}): ---` });
    parts.push({
      file_data: { mime_type: item.image.mimeType, file_uri: item.image.uri },
    });
  });

  return parts;
}

async function callGemini({ apiKey, parts }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          pages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                text: { type: 'string' },
              },
              required: ['index', 'text'],
            },
          },
        },
        required: ['pages'],
      },
    },
  };

  const res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('Gemini returned no text content');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }
  if (!parsed?.pages || !Array.isArray(parsed.pages)) {
    throw new Error('Gemini response missing pages array');
  }
  return parsed.pages;
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

    const apiKey = process.env.GEMINI_BATCH_OCR_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_BATCH_OCR_API_KEY (או GEMINI_API_KEY) לא מוגדר בשרת' },
        { status: 500 }
      );
    }

    const userId = (session?.user?._id || session?.user?.id)?.toString();
    const isAdmin = session ? session.user.role === 'admin' : true; // TEMP DEBUG

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
        geminiPages = await callGemini({ apiKey, parts });
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
      const byIndex = new Map();
      for (const item of geminiPages) {
        if (item && typeof item.index === 'number') byIndex.set(item.index, item.text || '');
      }

      for (let i = 0; i < batchPages.length; i++) {
        const p = batchPages[i];
        const idx = i + 1;
        const text =
          byIndex.get(idx) ??
          (geminiPages[i] && typeof geminiPages[i].text === 'string'
            ? geminiPages[i].text
            : null);
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
