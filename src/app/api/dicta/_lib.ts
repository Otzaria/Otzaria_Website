// קובץ זה שימש בעבר כמאגר יחיד לכל הלוגיקה של דיקטה (914 שורות, כמה תחומים
// לא קשורים). הלוגיקה פוצלה למודולים ייעודיים תחת _lib/, וקובץ זה משמש כעת
// כ-barrel שמייצא הכל מחדש כדי לא לשבור את שאר הנתיבים שמייבאים מ-"./_lib"
// או "../_lib".
//
// הערה: _lib/file-tools.ts (שהכיל dictaSync מבוסס-קבצים, סנכרון תיקייה מול
// GitHub) הוסר — לא נמצא לו אף קורא בפרויקט. הכלי dictaSync שבשימוש בפועל
// הוא מימוש שונה, מבוסס-DB, ב-src/lib/dicta/github-sync.js, שמיובא ישירות
// על-ידי src/app/api/dicta/tools/route.js (ולא דרך ה-barrel הזה).

export * from "./_lib/upload-paths";
export * from "./_lib/book-content";
export * from "./_lib/editor-tools";
export * from "./_lib/gematria";
