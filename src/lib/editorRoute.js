/**
 * האם הנתיב הוא עורך העמוד (/library/books/[path]/[pageNumber]).
 * העורך ממלא את חלון הדפדפן (100dvh) — בלי הפוטר של הספרייה ובלי גלילת דף (ראו LibraryChrome).
 * /library/books/[path]/example — עמוד סטטי (עמוד הדוגמה), לא העורך.
 * לוגיקה טהורה — editorRoute.test.mjs.
 */
export function isPageEditorPath(pathname) {
  if (typeof pathname !== 'string') return false
  const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean)
  return parts.length === 4 && parts[0] === 'library' && parts[1] === 'books' && parts[3] !== 'example'
}
