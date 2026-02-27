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
  let skippedCount = 0;
  let errorCount = 0;

  await connectDB();

  try {
    // 1. הורדת קובץ הרשימה (list.txt)
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
        const contentUrl = `${baseUrl}/${folderPath}/ספרים/אוצריא/${encodeURIComponent(fileName)}`;
        
        const contentResp = await fetch(contentUrl);
        
        if (!contentResp.ok) {
          log.push(`❌ שגיאה בהורדת התוכן עבור: ${fileName} (${contentResp.status})`);
          errorCount++;
          continue;
        }

        const content = await contentResp.text();

        // 4. יצירת הספר ב-DB
        await DictaBook.create({
          title: bookTitle,
          content: content,
          status: 'available', // ברירת מחדל
          createdAt: new Date(),
          updatedAt: new Date()
        });

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

    return { success: true, log, addedCount };

  } catch (error) {
    console.error("Critical Sync Error:", error);
    return { success: false, error: error.message, log };
  }
}