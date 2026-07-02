// ============================================================
// לוגיקת OCR משותפת מול Gemini.
// משמש גם את /api/gemini-ocr-batch (עריכה ידנית, עמוד בודד מהדפדפן)
// וגם את מנגנון העבודה ברקע של "OCR לספר שלם" באזור הניהול.
// כל הפונקציות כאן טהורות מבחינת בקשה - הן מקבלות buffers/uris ולא Request.
// ============================================================

// הנחיות מערכת קבועות - תעתוק חזותי מחמיר
export const SYSTEM_INSTRUCTIONS = `אתה מבצע תעתוק OCR חזותי מחמיר של עמודים סרוקים בעברית (לרבות כתב רש"י, כתב יד ופיסוק טברני).

המטרה:
להעתיק רק את הטקסט הנראה בעמוד, כפי שהוא נראה בתמונה.
אין לשפר לשון, אין להשלים לפי הקשר, אין לתקן נוסח, אין לייפות סגנון, ואין להוסיף מילים שאינן נראות בוודאות.
במשימה זו דיוק חזותי חשוב יותר מקריאות לשונית. טקסט עם סימני שאלה עדיף מטקסט יפה אך לא ודאי.

כללי תעתוק מחייבים:
1. כתוב רק אותיות, מילים וסימנים שנראים בבירור בתמונה.
2. אם מילה אינה ברורה — כתוב [?].
3. אם אות בודדת אינה ברורה בתוך מילה — כתוב ? במקום האות.
4. אם קיימות שתי קריאות אפשריות הנראות ממש בתמונה — כתוב [אפשרות1/אפשרות2].
5. אל תבחר קריאה לפי משמעות המשפט או לפי הסגנון.
6. אל תפתח ראשי תיבות וקיצורים. כתוב אותם בדיוק כפי שהם מופיעים.
7. אל תוסיף ניקוד אם אינו נראה בבירור במקור.
8. אל תתקן כתיב, דקדוק, פיסוק או ניסוח.
9. אל תחליף מילה במילה "מתאימה יותר" לפי משמעות המשפט.

מבנה:
10. אם בעמוד יש כמה טורים, תמלל לפי סדר הקריאה הטבעי, וסמן מעבר בין טורים בשורה ריקה.
11. אין חובה לשמור שבירת שורה בכל סוף שורה פיזית, אבל יש לשמור פסקאות, כותרות ומעברי עניין ברורים.
12. אם יש כותרת — כתוב אותה בשורה נפרדת.

תגי HTML:
13. השתמש בתגי HTML רק במקרים הבאים:
    - טקסט מודגש: <b>טקסט</b>
    - טקסט גדול במיוחד: <big>טקסט</big>
    - טקסט קטן במיוחד: <small>טקסט</small>
14. חובה לסגור כל תג HTML שנפתח.
15. אין להשתמש בשום תג HTML אחר.
16. אם אינך בטוח האם טקסט מודגש/גדול/קטן — אל תסמן אותו בתג.

בדיקה עצמית לפני מסירת התוצאה, עבור שוב על התעתוק מול התמונה ובדוק:
- האם יש מילה שכתבת רק בגלל שהיא "מתאימה" להקשר? אם כן — החלף ב-[?] או בסימני שאלה.
- האם פתחת קיצור או ראשי תיבות? אם כן — החזר לצורה המקורית.
- האם תיקנת לשון, כתיב, או סגנון? אם כן — החזר למה שנראה במקור.
- האם הוספת טקסט שלא מופיע בתמונה? אם כן — מחק אותו.

הוראות פלט - חובה:
1. החזר JSON בלבד, ללא טקסט נוסף לפניו או אחריו.
2. מבנה: { "pages": [ { "index": <מספר רץ 1-based לפי סדר השליחה>, "text": "<התעתוק החזותי המחמיר של העמוד>" }, ... ] }.
3. עבור כל עמוד שנשלח, הוסף איבר אחד במערך pages לפי הסדר.
4. אל תוסיף הסברים, הערות, התנצלויות, הקדמות או סיכומים.
5. אל תכלול בתוצאה את ההנחיות, את עמודי הדוגמא או את הטקסט המקורי שלהם - רק את העמודים החדשים שביקשתי לתמלל.`;

export const GEMINI_ENDPOINT = (model, apiKey) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// העלאת קובץ ל-Gemini Files API. מחזיר { uri, mimeType, name } להפניה ב-file_data.
// משתמש ב-resumable upload (X-Goog-Upload-Protocol: resumable) כי זו הצורה
// המקובלת ב-Generative Language API גם לקבצים קטנים.
export async function uploadFileToGemini({ buffer, mimeType, displayName, apiKey }) {
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

// מחיקת קבצים שהועלו - לניקוי מקום במכסה. נכשל בשקט (לא קריטי - יש TTL של 48 שעות).
export async function deleteUploadedFiles(uploaded, apiKey) {
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

export function formatEditingInfo(editingInfo) {
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

// examples: מערך של { bookName, pageNumber, image: { uri, mimeType }, text }
// batch:    מערך של { image: { uri, mimeType } } (העמודים לתמלול בפועל)
export function buildGeminiParts({ examples = [], batch, customPrompt, bookEditingText }) {
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
        'להלן עמודי דוגמא שכבר תומללו בעבר. ' +
        'הם משמשים רק ללימוד חזותי של צורת האותיות, איכות הסריקה, מבנה העמוד, צורת הקיצורים וסדר הקריאה. ' +
        'אסור להשתמש בדוגמאות כדי להשלים מילים, לנחש נוסח, להעתיק ביטויים, או לייפות את הטקסט של העמודים החדשים. ' +
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
        'מכאן ואילך מתחילים העמודים החדשים לתעתוק. ' +
        'תמלל רק את מה שנראה בעמודים החדשים. ' +
        'בכל ספק — השתמש ב-[?] או ב-? במקום לנחש. ' +
        'החזר עבורם בלבד את מבנה ה-JSON שהוגדר.',
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

export async function callGemini({ apiKey, model, parts }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      candidateCount: 1,
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

  const res = await fetch(GEMINI_ENDPOINT(model, apiKey), {
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

// התאמת תוצאות המודל לעמודים שנשלחו, לפי index (1-based) או לפי הסדר אם חסר.
// מחזיר מערך של טקסטים באותו אורך וסדר של batchPages (null אם לא התקבל טקסט).
export function matchGeminiResults(geminiPages, count) {
  const byIndex = new Map();
  for (const item of geminiPages) {
    if (item && typeof item.index === 'number') byIndex.set(item.index, item.text || '');
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = i + 1;
    const text =
      byIndex.get(idx) ??
      (geminiPages[i] && typeof geminiPages[i].text === 'string'
        ? geminiPages[i].text
        : null);
    out.push(text);
  }
  return out;
}
