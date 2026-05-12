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
// ניתן להוסיף, להסיר או לשנות את ההגדרות לפי הצורך:
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

async function fetchImageAsBase64(imagePath, requestUrl) {
  const imageUrl = new URL(imagePath, requestUrl).toString();
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image ${imagePath} (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime =
    res.headers.get('content-type') ||
    (imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  return { data: buf.toString('base64'), mime };
}

async function loadExamplePages(group, requestUrl) {
  const config = EXAMPLE_PAGES[group];
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
    const image = await fetchImageAsBase64(page.imagePath, requestUrl);
    results.push({ bookName: book.name, pageNumber: page.pageNumber, image, text });
  }
  return results;
}

function buildGeminiParts({ examples, batch, customPrompt }) {
  const parts = [];
  parts.push({ text: SYSTEM_INSTRUCTIONS });

  if (customPrompt && customPrompt.trim()) {
    parts.push({
      text:
        'הנחיות נוספות לתמלול (כללי עריכה ופורמט מהמשתמש):\n' +
        customPrompt.trim(),
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
      parts.push({ inline_data: { mime_type: ex.image.mime, data: ex.image.data } });
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
    parts.push({ inline_data: { mime_type: item.image.mime, data: item.image.data } });
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

    const userId = (session.user._id || session.user.id)?.toString();
    const isAdmin = session.user.role === 'admin';

    const body = await request.json();
    const { bookPath, pages, customPrompt, examples } = body || {};

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
    if (examples && !['A', 'B', 'C', 'D'].includes(examples)) {
      return NextResponse.json(
        { error: 'Invalid examples parameter (expected A/B/C/D)' },
        { status: 400 }
      );
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

    // טעינת דוגמאות פעם אחת, ושימוש חוזר בכל batch
    let exampleData = [];
    if (examples) {
      try {
        exampleData = await loadExamplePages(examples, request.url);
      } catch (e) {
        console.error('[gemini-ocr-batch] failed to load examples:', e);
      }
    }

    const batches = chunk(workable, BATCH_SIZE);

    for (const batchPages of batches) {
      // הכנת התמונות לכל הדפים בקבוצה
      let batchInputs;
      try {
        batchInputs = await Promise.all(
          batchPages.map(async (p) => ({
            page: p,
            image: await fetchImageAsBase64(p.imagePath, request.url),
          }))
        );
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

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      success: true,
      bookSlug: book.slug,
      model: GEMINI_MODEL,
      batches: batches.length,
      totalRequested: pageNumbers.length,
      totalProcessed: successCount,
      results,
    });
  } catch (error) {
    console.error('Gemini OCR Batch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
