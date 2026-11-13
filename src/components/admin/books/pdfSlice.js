// קריאה וחיתוך של PDF בדפדפן, ל"הוספת ספר" מטווח עמודים: סופרים את העמודים כשהקובץ נבחר, ובשליחה
// בונים PDF חדש רק מהעמודים שנבחרו — ולשרת נשלח הוא (במקום הקובץ כולו). השרת לא יודע על הטווח בכלל:
// מבחינתו זה PDF רגיל, והעמודים בספר ממוספרים 1..N כמו תמיד.
//
// pdf-lib נטען רק כשצריך (import דינמי) — לא נכנס לחבילת ה-JS של מסך הספרים. pdf-lib הוא JS טהור
// (בלי worker), ו-copyPages מעתיק את המשאבים המשותפים (גופנים, תמונות) פעם אחת לכל הקובץ החדש.
// טסטים: pdfSlice.test.js (על PDF אמיתי שנוצר ב-pdf-lib).

async function loadPdfLib() {
  return import('pdf-lib')
}

async function bytesOf(file) {
  if (typeof file?.arrayBuffer === 'function') return file.arrayBuffer()
  return new Response(file).arrayBuffer()
}

/**
 * טעינת הקובץ וספירת העמודים. PDF מוצפן נטען (ignoreEncryption) רק כדי לספור — אי אפשר לחתוך אותו
 * (התוכן נשאר מוצפן במפתח של הקובץ המקורי), ולכן encrypted: true והחלון מאפשר רק העלאה שלמה.
 * @param {Blob} file
 * @returns {Promise<{ doc: import('pdf-lib').PDFDocument, pageCount: number, encrypted: boolean }>}
 */
export async function openPdf(file) {
  const { PDFDocument } = await loadPdfLib()
  const doc = await PDFDocument.load(await bytesOf(file), { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  return { doc, pageCount: doc.getPageCount(), encrypted: Boolean(doc.isEncrypted) }
}

/**
 * PDF חדש מעמודים from..to (כולל, מספור מ-1) של doc, כקובץ בשם fileName.
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {{ from: number, to: number }} range
 * @param {string} fileName
 * @returns {Promise<File>}
 */
export async function slicePdf(doc, range, fileName) {
  const total = doc.getPageCount()
  if (!range || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to > total || range.from > range.to) {
    throw new RangeError(`invalid page range ${JSON.stringify(range)} for ${total} pages`)
  }
  const { PDFDocument } = await loadPdfLib()
  const out = await PDFDocument.create()
  const indices = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from - 1 + i)
  const pages = await out.copyPages(doc, indices)
  for (const page of pages) out.addPage(page)
  const bytes = await out.save()
  return new File([bytes], fileName, { type: 'application/pdf' })
}
