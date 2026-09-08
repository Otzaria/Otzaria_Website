/**
 * cacheTags — רישום מרכזי של תגיות מטמון ל-Next.js Data Cache (fetch/unstable_cache
 * עם { next: { tags: [...] } } או { tags: [...] }), ופונקציית עזר לביטול.
 *
 * למה בכלל למטמן: יש middleware שחוסם את כל האתר בשבת (src/proxy.js) וחייב
 * לראות כל בקשה — לכן שום מקום לא קובע Cache-Control שמאפשר לדפדפן/CDN
 * לדלג על השרת (ראו shabbatGatedCacheHeaders ב-src/lib/api-cache.js). המטמון
 * כאן הוא שכבת ה-Data Cache הפנימית של Next בצד השרת בלבד — היא לא חוסכת
 * מה-middleware לרוץ, רק חוסכת שאילתות DB חוזרות באותו שרת. זה תואם לגמרי
 * את דרישת ה-Shabbat gate.
 *
 * דפוס העבודה: לכל fetch/unstable_cache שממנו נבנה דף, קובעים גם `revalidate`
 * (חלון זמן גיבוי — TTL קצר, "רשת ביטחון" למקרה ששכחנו תגית במקום כלשהו)
 * וגם `tags` מהרשימה למטה. כל route שמשנה נתון מהדומיין הרלוונטי חייב לקרוא
 * ל-revalidateTag על התגית המתאימה **מיד אחרי שהכתיבה ל-DB הצליחה** — כך
 * שהדף הבא שנטען אחרי שינוי אמיתי (השעיה, אישור, מחיקה וכו') תמיד רואה
 * את הנתון החדש, בלי קשר לחלון ה-revalidate.
 *
 * חריגה מכוונת: שדות "עוקבים" טהורים שמתעדכנים בתדירות גבוהה מאוד ואין
 * להם משמעות תפעולית/משפטית (למשל downloadCount, שמתעדכן בכל הורדה) —
 * לא מקבלים תגית משלהם ולא מפעילים revalidateTag; הם פשוט מתעדכנים לכשעצמם
 * בתוך חלון ה-revalidate הרגיל (ראו REVALIDATE_SECONDS). אחרת, invalidation
 * על כל הורדה בודדת היה מבטל את התועלת של המטמון לגמרי בדף עמוס.
 */

export const CACHE_TAGS = {
  // רשימות/פרטי תוסף ציבוריים (חנות התוספים: page/all/category/[id])
  PLUGINS_PUBLIC: 'plugins-public',
  // הגדרות החנות (כותרות דף הבית, תוספים נבחרים)
  STORE_SETTINGS: 'store-settings',
  // קטגוריות תוספים (שיוך/סדר/נראות)
  PLUGIN_CATEGORIES: 'plugin-categories',
  // תור אימון OCR (רשימת עמודים זמינים/שלי)
  OCR_TRAINING_LIST: 'ocr-training-list',
  // רשימת כל המשתמשים + סטטיסטיקות (ניהול משתמשים, /library/admin/users) —
  // זהה לכל מנהל-על (role==='admin'), אין בה סינון לפי זהות הצופה.
  USERS_ADMIN_LIST: 'admin-users-list',
  // תור ההודעות המשותף לניהול (/library/admin/messages, ?allMessages=true) —
  // זהה לכל בעל הרשאת ניהול כלשהי (hasAnyAdminAccess), ראו ההסבר המלא
  // ב-src/app/library/admin/messages/page.jsx על ההבחנה מתיבת-דואר אישית.
  MESSAGES_ADMIN_LIST: 'admin-messages-list',
  // רשימת הספרים בממשק ניהול הספרים (/library/admin/books) — נתון זהה לכל
  // מנהל (לא מסונן לפי בעלים; מציג את כל הספרים כולל אישיים/מוסתרים)
  BOOKS_ADMIN_LIST: 'books-admin-list',
  // רשימת ההעלאות בממשק ניהול העלאות (/library/admin/uploads) — כל ההעלאות
  // שאינן באשפה (isDeleted: false), זהה לכל מנהל
  UPLOADS_ADMIN_LIST: 'uploads-admin-list',
  // רשימת ספרי הדיקטה בממשק ניהול (/library/admin/dicta-books) — כל הספרים,
  // זהה לכל מנהל
  DICTA_BOOKS_ADMIN_LIST: 'dicta-books-admin-list',
}

/** חלונות revalidate ברירת-מחדל (שניות) — "רשת ביטחון" בנוסף לתגיות. */
export const REVALIDATE_SECONDS = {
  // תוכן שמשתנה רק ע"י פעולת מנהל/משתמש מפורשת — כל שינוי אמיתי מכוסה
  // ע"י revalidateTag, כך שחלון ארוך יחסית בטוח.
  PLUGINS_PUBLIC: 60,
  STORE_SETTINGS: 60,
  PLUGIN_CATEGORIES: 60,
  OCR_TRAINING_LIST: 30,
  USERS_ADMIN_LIST: 45,
  MESSAGES_ADMIN_LIST: 30,
  // התקדמות עמודים (completedPages/inProgressPages) מתעדכנת בכל שמירת עמוד
  // בודדת — תדירות גבוהה מדי לתיוג לכל שמירה, ולכן חלון קצר יחסית כרשת ביטחון
  // (ראו ההסבר על downloadCount למעלה; אותו עיקרון).
  BOOKS_ADMIN_LIST: 30,
  UPLOADS_ADMIN_LIST: 30,
  DICTA_BOOKS_ADMIN_LIST: 30,
}
