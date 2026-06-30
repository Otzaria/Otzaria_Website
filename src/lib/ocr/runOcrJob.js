import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrJob from '@/models/OcrJob';
import { readPageImage, splitImageVertically } from '@/lib/ocr/images';
import { ocrwinRecognize } from '@/lib/ocr/ocrwin';
import {
  chunk,
  uploadFileToGemini,
  deleteUploadedFiles,
  formatEditingInfo,
  buildGeminiParts,
  callGemini,
  matchGeminiResults,
} from '@/lib/ocr/gemini';

const GEMINI_BATCH_SIZE = 5;

// בודק האם עמוד כבר מכיל טקסט כלשהו (תוכן ראשי או טורים).
function pageHasText(p) {
  return !!(p.content?.trim() || p.rightColumn?.trim() || p.leftColumn?.trim());
}

// העדכון שנכתב לעמוד לאחר OCR: הטקסט מחליף את התוכן, והטורים מתאפסים
// (פלט ה-OCR הוא טקסט יחיד). במצב "דלג" ממילא נוגעים רק בעמודים ריקים.
function buildPageUpdate(text) {
  return {
    content: text,
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
  };
}

// מכין את מקטעי התמונה של עמוד ל-OCR: מקטע אחד רגיל, או שניים (ימין/שמאל)
// כאשר split פעיל. מחזיר מערך של { buffer, mimeType, displayName }.
async function preparePageSegments(p, split) {
  const img = await readPageImage(p.imagePath);
  if (!split) return [img];
  const halves = await splitImageVertically(img.buffer);
  return halves.map((h) => ({
    buffer: h.buffer,
    mimeType: h.mimeType,
    displayName: `${img.displayName}.${h.side}`,
  }));
}

// מאחד טקסטים של מקטעי עמוד (ימין ואז שמאל) לטקסט עמוד אחד.
function mergeSegmentTexts(texts) {
  return texts
    .filter((t) => t != null && String(t).trim() !== '')
    .join('\n\n');
}

async function isCancelled(jobId) {
  const fresh = await OcrJob.findById(jobId).select('cancelRequested').lean();
  return !!fresh?.cancelRequested;
}

async function recordPageResult(jobId, pageNumber, ok, message) {
  const update = {
    $inc: { processedPages: 1, successPages: ok ? 1 : 0, failedPages: ok ? 0 : 1 },
    $set: { currentPageNumber: pageNumber },
  };
  if (!ok && message) {
    update.$push = { pageErrors: { pageNumber, message: String(message).slice(0, 500) } };
  }
  await OcrJob.updateOne({ _id: jobId }, update);
}

async function finishJob(jobId, status, error) {
  await OcrJob.updateOne(
    { _id: jobId },
    { $set: { status, error: error || '', finishedAt: new Date() } }
  );
}

// טוען את עמוד הדוגמא של הספר (אם הוגדר) ומעלה אותו ל-Gemini Files API,
// כדי לשמש דוגמא חזותית לכל הקבוצות. נכשל בשקט.
async function loadBookExample(book, apiKey) {
  if (!book.examplePage) return [];
  try {
    const page = await Page.findOne({ book: book._id, pageNumber: book.examplePage }).lean();
    if (!page?.imagePath) return [];
    const text = [page.content, page.rightColumn, page.leftColumn].filter(Boolean).join('\n\n');
    if (!text.trim()) return [];
    const img = await readPageImage(page.imagePath);
    const uploaded = await uploadFileToGemini({
      buffer: img.buffer,
      mimeType: img.mimeType,
      displayName: img.displayName,
      apiKey,
    });
    return [{
      bookName: book.name,
      pageNumber: page.pageNumber,
      image: { uri: uploaded.uri, mimeType: uploaded.mimeType, name: uploaded.name },
      text,
    }];
  } catch (e) {
    console.warn('[ocr-job] failed to load book example:', e.message);
    return [];
  }
}

async function runGemini(job, book, pages) {
  const apiKey = process.env.GEMINI_BATCH_OCR_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await finishJob(job._id, 'failed', 'GEMINI_BATCH_OCR_API_KEY (או GEMINI_API_KEY) לא מוגדר בשרת');
    return;
  }
  const model = job.model || 'gemini-2.5-pro';
  const bookEditingText = formatEditingInfo(book.editingInfo);

  const split = !!job.splitColumns;
  const exampleData = await loadBookExample(book, apiKey);
  const uploadedFiles = exampleData.map((ex) => ex.image);

  try {
    const batches = chunk(pages, GEMINI_BATCH_SIZE);
    for (const batchPages of batches) {
      if (await isCancelled(job._id)) {
        await finishJob(job._id, 'cancelled');
        return;
      }

      // הכנת מקטעי הקבוצה: כל עמוד -> מקטע אחד או שניים (ימין/שמאל), קריאה מהדיסק
      // והעלאה ל-Files API. שומרים את גבולות העמוד כדי לאחד את התוצאות בחזרה.
      let pageUnits;
      try {
        pageUnits = await Promise.all(
          batchPages.map(async (p) => {
            const segments = await preparePageSegments(p, split);
            const images = [];
            for (const seg of segments) {
              const uploaded = await uploadFileToGemini({
                buffer: seg.buffer,
                mimeType: seg.mimeType,
                displayName: seg.displayName,
                apiKey,
              });
              uploadedFiles.push(uploaded);
              images.push({ uri: uploaded.uri, mimeType: uploaded.mimeType });
            }
            return { page: p, images };
          })
        );
      } catch (e) {
        for (const p of batchPages) {
          await recordPageResult(job._id, p.pageNumber, false, 'שגיאה בטעינת תמונה: ' + e.message);
        }
        continue;
      }

      // מערך תמונות שטוח לשליחה (מקטע = תמונה), בסדר העמודים והמקטעים
      const flatBatch = pageUnits.flatMap((u) => u.images.map((image) => ({ image })));

      let geminiPages;
      try {
        const parts = buildGeminiParts({
          examples: exampleData,
          batch: flatBatch,
          bookEditingText,
        });
        geminiPages = await callGemini({ apiKey, model, parts });
      } catch (e) {
        for (const p of batchPages) {
          await recordPageResult(job._id, p.pageNumber, false, 'שגיאת מודל: ' + e.message);
        }
        continue;
      }

      // התאמת הטקסטים למקטעים לפי הסדר, ואז איחוד חזרה לכל עמוד
      const flatTexts = matchGeminiResults(geminiPages, flatBatch.length);
      let cursor = 0;
      for (const u of pageUnits) {
        const segTexts = u.images.map(() => flatTexts[cursor++]);
        if (segTexts.every((t) => t == null)) {
          await recordPageResult(job._id, u.page.pageNumber, false, 'לא התקבל טקסט מהמודל');
          continue;
        }
        try {
          await Page.findByIdAndUpdate(u.page._id, buildPageUpdate(mergeSegmentTexts(segTexts)));
          await recordPageResult(job._id, u.page.pageNumber, true);
        } catch (e) {
          await recordPageResult(job._id, u.page.pageNumber, false, 'שגיאה בשמירה: ' + e.message);
        }
      }
    }
    await finishJob(job._id, 'completed');
  } finally {
    // ניקוי קבצים שהועלו ל-Gemini Files API (חיסכון במכסה)
    deleteUploadedFiles(uploadedFiles, apiKey).catch((e) =>
      console.warn('[ocr-job] gemini cleanup failed:', e.message)
    );
  }
}

async function runOcrwin(job, pages) {
  const split = !!job.splitColumns;
  for (const p of pages) {
    if (await isCancelled(job._id)) {
      await finishJob(job._id, 'cancelled');
      return;
    }
    try {
      const segments = await preparePageSegments(p, split);
      const texts = [];
      for (const seg of segments) {
        const blob = new Blob([seg.buffer], { type: seg.mimeType });
        texts.push(await ocrwinRecognize(blob, seg.displayName));
      }
      await Page.findByIdAndUpdate(p._id, buildPageUpdate(mergeSegmentTexts(texts)));
      await recordPageResult(job._id, p.pageNumber, true);
    } catch (e) {
      await recordPageResult(job._id, p.pageNumber, false, e.message);
    }
  }
  await finishJob(job._id, 'completed');
}

// נקודת הכניסה: רצה ללא await מנתיב ה-start, וממשיכה לרוץ ברקע
// כל עוד תהליך ה-Node (next start) חי.
export async function runOcrJob(jobId) {
  try {
    await connectDB();
    const job = await OcrJob.findById(jobId);
    if (!job || job.status !== 'running') return;

    const book = await Book.findById(job.book);
    if (!book) {
      await finishJob(jobId, 'failed', 'הספר לא נמצא');
      return;
    }

    // בניית רשימת העמודים לעיבוד (מקור האמת), ממוינת לפי מספר עמוד.
    const allPages = await Page.find({ book: book._id }).sort({ pageNumber: 1 });
    const pages = allPages.filter((p) => {
      if (!p.imagePath) return false;
      if (job.existingTextMode === 'skip' && pageHasText(p)) return false;
      return true;
    });

    await OcrJob.updateOne({ _id: jobId }, { $set: { totalPages: pages.length } });

    if (pages.length === 0) {
      await finishJob(jobId, 'completed');
      return;
    }

    if (job.method === 'gemini') {
      await runGemini(job, book, pages);
    } else {
      await runOcrwin(job, pages);
    }
  } catch (e) {
    console.error('[ocr-job] fatal error:', e);
    try {
      await finishJob(jobId, 'failed', e.message);
    } catch (_) {}
  }
}
