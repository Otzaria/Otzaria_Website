// שם קובץ להורדת עותק עריכה — משותף לדף העורך ולראוט ההורדה.
const DEFAULT_NAME = 'edit-copy'

export function getDownloadBaseName(title = DEFAULT_NAME) {
  const normalizedTitle = typeof title === 'string' ? title : DEFAULT_NAME
  const lastSegment = normalizedTitle.split('/').filter(Boolean).pop() || normalizedTitle
  return lastSegment.trim() || DEFAULT_NAME
}

export function buildDownloadFilename(title) {
  const safeTitle = getDownloadBaseName(title)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return `${safeTitle || DEFAULT_NAME}.txt`
}

// גיבוי ASCII לכותרת Content-Disposition (filename=) לדפדפנים שלא תומכים ב-filename*
export function buildAsciiFilename(filename) {
  return filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || `${DEFAULT_NAME}.txt`
}
