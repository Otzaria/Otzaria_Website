// Content-Disposition להורדת קובץ, עם תמיכה בשמות בעברית/Unicode (RFC 6266 + RFC 5987):
// filename= נושא גיבוי ASCII לדפדפנים ישנים, ו-filename*= את השם המלא בקידוד UTF-8.
// encodeURIComponent אינו מקודד את ! ' ( ) * — מקודדים ידנית כדי לעמוד ב-RFC 3986.
export function attachmentDisposition(rawName) {
  const name = (rawName || '').toString()
  const asciiFallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_')
  const encodedName = encodeURIComponent(name)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
}
