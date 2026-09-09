// לוגיקה טהורה: בניית שם קובץ בסיסי להורדת ספר דיקטה מתוך כותרת הספר.
// מחולצת בנפרד כדי לאפשר בדיקה ישירה ללא רינדור העמוד.
export function getDownloadBaseName(title = 'dicta-book') {
  const normalizedTitle = typeof title === 'string' ? title : 'dicta-book'
  const lastSegment = normalizedTitle.split('/').filter(Boolean).pop() || normalizedTitle
  return lastSegment.trim() || 'dicta-book'
}
