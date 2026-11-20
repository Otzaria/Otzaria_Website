import path from 'node:path'

// מחוץ ל-public ולשורש ההעלאות שמוגש גם בשרת הקבצים של ההתקנה.
export function privateBookRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'private-books')
}

export function resolvePrivateBookPath(imagePath) {
  const value = String(imagePath)
  const match = /^\/private-books\/([a-f0-9-]{36})\/(page\.[1-9]\d*\.jpg)$/.exec(value)
    || /^\/private-books\/([a-f0-9-]{36})$/.exec(value)
  if (!match) throw new Error('נתיב ספר פרטי לא תקין')
  return path.join(privateBookRoot(), match[1], ...(match[2] ? [match[2]] : []))
}
