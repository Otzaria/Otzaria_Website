import connectDB from "@/lib/db";
import DictaBook from "@/models/DictaBook";

// כתובת הבסיס של התיקייה בגיטהאב (Raw Content)
const DEFAULT_REPO_URL = "https://raw.githubusercontent.com/Otzaria/otzaria-library/refs/heads/main";
const DEFAULT_FOLDER = "DictaToOtzaria/לא ערוך";

/**
 * מסנכרן ספרים מתיקייה בגיטהאב למסד הנתונים
 * @param {string} [customFolderPath] - נתיב תיקייה אופציונלי בתוך הריפו
 */
export async function dictaSync(customFolderPath) {
  const folderPath = customFolderPath || DEFAULT_FOLDER;
  const baseUrl = process.env.DICTA_GITHUB_REPO || DEFAULT_REPO_URL;
  
  const log = [];
  let addedCount = 0;
  let errorCount = 0;
  const createdBookIds = [];

  await connectDB();

  try {
    // 1. הורדת קובץ הרשימה (list.txt)
    // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/request-forgery (נסגרה ידנית ב-GitHub, ראו הסבר): baseUrl is a fixed origin (env var set by
    // the deployer or the hardcoded DEFAULT_REPO_URL, never user input) and folderPath is just
    // appended as a path segment via string concatenation — it cannot change the request host.
    // This endpoint is also admin-gated (see tools/route.js: dicta-sync requires hasBooksAccess).
    const listUrl = `${baseUrl}/${folderPath}/list.txt`;
    log.push(`טוען רשימת קבצים מ: ${listUrl}`);

    const listResp = await fetch(listUrl);
    if (!listResp.ok) {
      throw new Error(`שגיאה בטעינת list.txt (סטטוס: ${listResp.status})`);
    }

    // פירוק הרשימה לשורות וניקוי רווחים
    const rawText = await listResp.text();
    const fileList = rawText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.endsWith('.txt'));

    log.push(`נמצאו ${fileList.length} קבצים ברשימה.`);

    // 2. מעבר על כל קובץ ברשימה
    for (const fileName of fileList) {
      try {
        // המרת שם הקובץ לשם ספר (הסרת סיומת והחלפת קווים תחתונים ברווחים)
        // שים לב: זה תלוי באיך השמות שמורים בגיטהאב. הנחתי כאן פורמט סטנדרטי.
        const bookTitle = fileName
            .replace(/\.txt$/i, '')
            .replace(/_/g, ' ')
            .trim();

        // בדיקה אם הספר כבר קיים ב-DB
        const existingBook = await DictaBook.findOne({ title: bookTitle }).select('_id');

        if (existingBook) {
          // ספר קיים - מדלגים (כדי לא לדרוס עבודה שנעשתה)
          // skippedCount++; 
          // log.push(`קיים: ${bookTitle}`); // אופציונלי: להוריד הערה כדי להקטין עומס בלוג
          continue;
        }

        // 3. הורדת תוכן הספר
        // הנתיב הוא: base + folder + ספרים/אוצריא + filename
        // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/request-forgery (נסגרה ידנית ב-GitHub, ראו הסבר): same fixed-origin reasoning as the
        // list.txt fetch above — baseUrl can't be overridden, and fileName comes from that
        // same trusted list.txt, not from an external caller.
        const contentUrl = `${baseUrl}/${folderPath}/ספרים/אוצריא/${encodeURIComponent(fileName)}`;

        const contentResp = await fetch(contentUrl);
        
        if (!contentResp.ok) {
          log.push(`❌ שגיאה בהורדת התוכן עבור: ${fileName} (${contentResp.status})`);
          errorCount++;
          continue;
        }

        const content = await contentResp.text();

        // 4. יצירת הספר ב-DB
        const createdBook = await DictaBook.create({
          title: bookTitle,
          content: content,
          status: 'available', // ברירת מחדל
          createdAt: new Date(),
          updatedAt: new Date()
        });

        createdBookIds.push(createdBook._id);

        log.push(`✅ נוסף: ${bookTitle}`);
        addedCount++;

      } catch (innerError) {
        console.error(`Error processing file ${fileName}:`, innerError);
        log.push(`❌ שגיאה בעיבוד: ${fileName}`);
        errorCount++;
      }
    }

    log.push('--------------------------------');
    log.push(`סיכום: נוספו ${addedCount}, דולגו ${fileList.length - addedCount - errorCount}, שגיאות ${errorCount}`);

    // ניקוי כפולות שנוצרו בסנכרון
    const dedupResult = await removeDuplicateBooks(createdBookIds);
    if (dedupResult.deletedCount > 0) {
      log.push(`🧹 הוסרו ${dedupResult.deletedCount} ספרים כפולים`);
    }

    return { success: true, log, addedCount };

  } catch (error) {
    console.error("Critical Sync Error:", error);
    return { success: false, error: error.message, log };
  }
}

/**
 * מוחק רק ספרים כפולים שנוצרו בהרצת הסנכרון הנוכחית.
 * ספרים קיימים לעולם לא יימחקו כאן, גם אם יש להם אותו שם.
 * מחזיר { deletedCount }.
 */
export async function removeDuplicateBooks(createdBookIds = []) {
  await connectDB();

  if (createdBookIds.length === 0) return { deletedCount: 0 };

  const createdBooks = await DictaBook.find({ _id: { $in: createdBookIds } })
    .select('_id title')
    .lean();

  if (createdBooks.length === 0) return { deletedCount: 0 };

  const createdBookIdsSet = new Set(createdBooks.map((book) => String(book._id)));
  const createdTitles = [...new Set(createdBooks.map((book) => book.title).filter(Boolean))];

  if (createdTitles.length === 0) return { deletedCount: 0 };

  const duplicates = await DictaBook.aggregate([
    { $match: { title: { $in: createdTitles } } },
    { $group: { _id: '$title', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicates.length === 0) return { deletedCount: 0 };

  let deletedCount = 0;

  for (const dup of duplicates) {
    const existingIds = dup.ids.filter((id) => !createdBookIdsSet.has(String(id)));
    let toDelete = dup.ids.filter((id) => createdBookIdsSet.has(String(id)));

    if (existingIds.length === 0 && toDelete.length > 0) {
      toDelete = toDelete.slice(1);
    }

    if (toDelete.length === 0) continue;

    await DictaBook.deleteMany({ _id: { $in: toDelete } });
    deletedCount += toDelete.length;
  }

  return { deletedCount };
}