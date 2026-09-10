/**
 * cacheTags — רישום מרכזי של תגיות מטמון ל-Next.js Data Cache (fetch/unstable_cache
 * עם { next: { tags: [...] } } או { tags: [...] }), ופונקציית עזר לביטול.
 *
 * למה בכלל למטמן: המטמון כאן הוא שכבת ה-Data Cache הפנימית של Next בצד
 * השרת בלבד — הוא חוסך שאילתות DB חוזרות באותו שרת, בנפרד מ-HTTP caching
 * (CDN/דפדפן) שמוגדר במפורש בדפים/API ציבוריים שלא תלויים ב-session (ראו
 * CLAUDE.md, סעיף "מטמון"). יש middleware שחוסם את כל האתר בשבת (src/proxy.js)
 * — זו אינה סיבה לוותר על HTTP caching, אלא רק סיבה לשמור על TTL קצר-מוגבל
 * בדפים/נתיבים "רגישי-שבת" כדי לצמצם את חלון הדליפה.
 *
 * דפוס העבודה: לכל fetch/unstable_cache שממנו נבנה דף, קובעים גם `revalidate`
 * (חלון זמן גיבוי — TTL קצר, "רשת ביטחון" למקרה ששכחנו תגית במקום כלשהו)
 * וגם `tags` מהרשימה למטה. כל route שמשנה נתון מהדומיין הרלוונטי חייב לקרוא
 * ל-revalidateNow (למטה) על התגית המתאימה **מיד אחרי שהכתיבה ל-DB הצליחה** —
 * כך שהדף הבא שנטען אחרי שינוי אמיתי (השעיה, אישור, מחיקה וכו') תמיד רואה
 * את הנתון החדש, בלי קשר לחלון ה-revalidate.
 *
 * חריגה מכוונת: שדות "עוקבים" טהורים שמתעדכנים בתדירות גבוהה מאוד ואין
 * להם משמעות תפעולית/משפטית (למשל downloadCount, שמתעדכן בכל הורדה) —
 * לא מקבלים תגית משלהם ולא מפעילים ביטול; הם פשוט מתעדכנים לכשעצמם
 * בתוך חלון ה-revalidate הרגיל (ראו REVALIDATE_SECONDS). אחרת, invalidation
 * על כל הורדה בודדת היה מבטל את התועלת של המטמון לגמרי בדף עמוס.
 *
 * למה revalidateNow ולא revalidateTag(tag) ישירות: החל מ-Next 16,
 * revalidateTag דורש ארגומנט שני (profile). בלעדיו הפונקציה עדיין עובדת
 * בפועל (רק מדפיסה אזהרת deprecation ל-console), אבל התיעוד הרשמי מציין
 * שההתנהגות הזו עשויה להיעלם בגרסה עתידית. הפיתוי הטבעי הוא להוסיף
 * `'max'` כארגומנט שני (כך שמופיע בדוגמאות הרשמיות) — **אסור לעשות זאת
 * כאן**: `'max'` נותן סמנטיקת stale-while-revalidate (התוכן הישן ממשיך
 * להיות מוגש עד שמישהו מבקר בדף ומפעיל רענון ברקע), בעוד כל העיצוב הזה
 * (למשל "תוסף מושהה נעלם מיד") דורש תפוגה **מיידית**. לפי התיעוד הרשמי של
 * revalidateTag: "for webhooks or third-party services that need immediate
 * expiration... pass `{ expire: 0 }`... necessary when external systems
 * call your Route Handlers" — בדיוק המצב שלנו (Route Handlers, לא Server
 * Actions, ולכן גם updateTag לא זמין — הוא זורק שגיאה מחוץ ל-Server Action).
 */
import { revalidateTag } from 'next/cache'

/**
 * מבטל תגית מטמון **מיידית** (לא stale-while-revalidate) — לקרוא מ-Route
 * Handler מיד אחרי כתיבה מוצלחת ל-DB. ראו ההסבר המלא למעלה על ההבדל בין
 * זה לבין revalidateTag(tag, 'max').
 */
export function revalidateNow(tag) {
  revalidateTag(tag, { expire: 0 })
}

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

/**
 * חלונות revalidate ברירת-מחדל (שניות) — "רשת ביטחון" בנוסף לתגיות.
 *
 * חלון ארוך (600) מוגדר רק לתגיות שנבדק בפועל (גרפ אחר revalidateNow בכל
 * src/app/api/**) שכל כתיבה רלוונטית מתייגת אותן במלואן — ראו הביקורת
 * ב-git log של קובץ זה למיפוי המלא. תגית שנשארה עם חלון קצר למרות שרוב
 * הכתיבות בה כן מתויגות — יש לה סיבה ספציפית מתועדת ליד הערך (שדה
 * untracked בתדירות גבוהה בסגנון downloadCount, או שיקול UX של תור-תפוסה),
 * לא שכחה.
 */
export const REVALIDATE_SECONDS = {
  // תוכן ציבורי (חנות התוספים, נצרך גם ע"י CDN חיצוני) שמשתנה רק ע"י פעולת
  // מנהל מפורשת — כל שינוי אמיתי מכוסה ע"י revalidateNow בכל route הכתיבה
  // הרלוונטי (plugins/[id]/*, plugin-categories/*, store-settings), חוץ
  // מ-downloadCount המתועד למעלה בכוונה. לכן חלון ארוך בטוח.
  PLUGINS_PUBLIC: 600,
  STORE_SETTINGS: 600,
  PLUGIN_CATEGORIES: 600,
  // תור-תפוסה (claim/release/complete) — כן מכוסה במלואה ע"י revalidateNow
  // (ocr-training/[id]/claim|release|complete, admin/ocr-training/*), אבל
  // נשאר קצר בכוונה: התועלת כאן היא לא רק "רשת ביטחון" לתיוג שנשכח, אלא
  // צמצום חלון ההתנגשות בין כמה מתייגים שמנסים לתפוס עמוד בו-זמנית. שינוי
  // סטטוס בפועל מתפרסם מיידית דרך revalidateNow ממילא; ה-30 שניות כאן הן
  // רק לצופה שלא רענן את הדף. (השמירה האוטומטית של שורות/rotation ב-
  // ocr-training/[id]/lines אינה מתויגת בכוונה — לא משנה זמינות עמוד, ראו
  // ההערה שם.)
  OCR_TRAINING_LIST: 30,
  // לא הוארך: getAdminUsersWithStats כולל completedPages/inProgressPages
  // שמתעדכנים בכל תפיסה/השלמה/ביטול-השלמה של עמוד (book/claim-page,
  // book/complete-page, book/uncomplete-page) — אף אחד מהם לא קורא
  // ל-revalidateNow(USERS_ADMIN_LIST) (אותה חריגת-תדירות-גבוהה בדיוק כמו
  // downloadCount). בנוסף הרשמת משתמש חדש (auth/register) לא מתייגת את
  // הרשימה. לכן חלון קצר יחסית עדיין נחוץ כרשת ביטחון אמיתית, לא רק גיבוי.
  USERS_ADMIN_LIST: 45,
  // הוארך: כל יצירת/שינוי הודעה שמשפיעה על הרשימה (messages/route.js,
  // messages/reply, messages/mark-read, messages/delete, messages/send-admin)
  // קוראת ל-revalidateNow. הודעות-מערכת (createSystemMessage, ב-
  // systemMessages.js) לא מתייגות — אך זה תקין ולא חריג: getAdminMessagesList
  // מסנן החוצה messageType==='system' בכוונה, כך שהן לא אמורות להשפיע על
  // הרשימה הזו כלל.
  MESSAGES_ADMIN_LIST: 300,
  // התקדמות עמודים (completedPages/inProgressPages) מתעדכנת בכל שמירת עמוד
  // בודדת — תדירות גבוהה מדי לתיוג לכל שמירה, ולכן חלון קצר יחסית כרשת ביטחון
  // (ראו ההסבר על downloadCount למעלה; אותו עיקרון). אין לגעת.
  BOOKS_ADMIN_LIST: 30,
  // לא הוארך: /api/upload-book (יצירת העלאה חדשה ע"י משתמש, לא ראוט האדמין)
  // יוצר Upload חדש (Upload.create) בלי לקרוא ל-revalidateNow(UPLOADS_ADMIN_LIST)
  // — רק ראוטי הניהול (move-to-trash/restore/update-status/batch-*) מתייגים.
  // כלומר העלאה חדשה שממתינה לטיפול תופיע ברשימת הניהול רק בתוך חלון
  // ה-revalidate, לא מיידית — לכן משאירים קצר.
  UPLOADS_ADMIN_LIST: 30,
  // לא הוארך: cron/check-stale-pages (שחרור אוטומטי של ספרי דיקטה תקועים,
  // status→'available'/claimedBy→null) מעדכן DictaBook ישירות עם
  // DictaBook.updateOne/updateMany בלי revalidateNow(DICTA_BOOKS_ADMIN_LIST)
  // — בניגוד לכל שאר ראוטי dicta/books/* שכן מתייגים. חלון קצר נשאר נחוץ
  // כרשת ביטחון אמיתית לשינוי הזה.
  DICTA_BOOKS_ADMIN_LIST: 30,
}
