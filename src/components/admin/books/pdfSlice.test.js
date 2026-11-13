// @vitest-environment node
// חיתוך PDF אמיתי (pdf-lib): מספר העמודים, הסדר (לפי גודל עמוד שונה לכל עמוד), וטווח לא תקין.
import { describe, expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { openPdf, slicePdf } from './pdfSlice'

async function samplePdf(pages) {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage([100 + i, 200]) // רוחב = 100 + מספר העמוד
  return new File([await doc.save()], 'sample.pdf', { type: 'application/pdf' })
}

const widths = async (file) => (await PDFDocument.load(await file.arrayBuffer())).getPages().map((p) => p.getWidth())

describe('pdfSlice', () => {
  test('openPdf סופר עמודים; PDF לא מוצפן', async () => {
    const { pageCount, encrypted } = await openPdf(await samplePdf(7))
    expect(pageCount).toBe(7)
    expect(encrypted).toBe(false)
  })

  test('slicePdf: רק העמודים שבטווח, באותו סדר, כקובץ PDF בשם שניתן', async () => {
    const { doc } = await openPdf(await samplePdf(7))
    const out = await slicePdf(doc, { from: 3, to: 5 }, 'חלק.pdf')
    expect(out.name).toBe('חלק.pdf')
    expect(out.type).toBe('application/pdf')
    expect(await widths(out)).toEqual([103, 104, 105])
  })

  test('slicePdf: עמוד יחיד, ועמוד אחרון', async () => {
    const { doc } = await openPdf(await samplePdf(4))
    expect(await widths(await slicePdf(doc, { from: 4, to: 4 }, 'x.pdf'))).toEqual([104])
  })

  test('slicePdf: טווח מחוץ לקובץ — שגיאה ולא קובץ חלקי', async () => {
    const { doc } = await openPdf(await samplePdf(4))
    await expect(slicePdf(doc, { from: 3, to: 5 }, 'x.pdf')).rejects.toThrow(RangeError)
    await expect(slicePdf(doc, { from: 0, to: 2 }, 'x.pdf')).rejects.toThrow(RangeError)
    await expect(slicePdf(doc, { from: 3, to: 2 }, 'x.pdf')).rejects.toThrow(RangeError)
  })
})
