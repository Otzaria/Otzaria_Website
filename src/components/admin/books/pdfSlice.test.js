// @vitest-environment node
// חיתוך PDF אמיתי: מספר וסדר העמודים, משאבי תמונה משותפים, והשוואת פיקסלים עם PDF.js.
import { describe, expect, test } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import { openPdf, slicePdf } from './pdfSlice'
import { MAX_PDF_BYTES, slicedSizeError } from '@/lib/adminBooks/bookTerms'

async function samplePdf(pages) {
  const doc = await PDFDocument.create()
  for (let i = 1; i <= pages; i++) doc.addPage([100 + i, 200]) // רוחב = 100 + מספר העמוד
  return new File([await doc.save()], 'sample.pdf', { type: 'application/pdf' })
}

const widths = async (file) => (await PDFDocument.load(await file.arrayBuffer())).getPages().map((p) => p.getWidth())

const pdfFile = async (doc) => new File([await doc.save()], 'scan.pdf', { type: 'application/pdf' })
const contents = (doc, page, text) => page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(text)))
function image(doc, width, height, value) {
  return doc.context.register(doc.context.stream(new Uint8Array(width * height * 3).fill(value), {
    Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
  }))
}
const images = (doc) => doc.context.enumerateIndirectObjects()
  .filter(([, object]) => object.dict?.get(PDFName.of('Subtype')) === PDFName.of('Image'))

async function renderPage(file, pageNumber = 1) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
    return Buffer.from(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } finally { await task.destroy() }
}

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

  test('משאבים משותפים: מקור מעל 50MB נחתך לעמודים שניתן להעלות, בלי לשנות את המקור', async () => {
    const source = await PDFDocument.create()
    const resources = source.context.obj({ XObject: { First: image(source, 4000, 2300, 80), Second: image(source, 4000, 2300, 180) } })
    for (const name of ['First', 'Second']) {
      const page = source.addPage([100, 100])
      page.node.set(PDFName.of('Resources'), resources)
      contents(source, page, `q 100 0 0 100 0 0 cm /${name} Do Q`)
    }
    const file = await pdfFile(source)
    expect(file.size).toBeGreaterThan(MAX_PDF_BYTES)
    const { doc } = await openPdf(file)
    // אותו מסמך שמור משמש לחיתוכים חוזרים אחרי שינוי טווח או כשל בהעלאה.
    for (const [page, value] of [[1, 80], [2, 180]]) {
      const slice = await slicePdf(doc, { from: page, to: page }, 'part.pdf')
      const extracted = await PDFDocument.load(await slice.arrayBuffer())
      expect(extracted.getPageCount()).toBe(1)
      expect(slice.size).toBeLessThan(MAX_PDF_BYTES)
      expect(slicedSizeError(slice.size)).toBeNull()
      expect(images(extracted)).toHaveLength(1)
      expect(images(extracted)[0][1].contents[0]).toBe(value)
    }
    expect(doc.getPage(0).node.Resources().lookup(PDFName.of('XObject')).keys()).toHaveLength(2)
  })

  test('Forms מקוננים, דוגמאות מרוצפות ומראה הערה שומרים תמונות ופלט חזותי זהה', async () => {
    const source = await PDFDocument.create()
    const red = image(source, 1, 1, 80)
    const gray = image(source, 1, 1, 180)
    const unused = image(source, 1, 1, 250)
    const shared = source.context.obj({ XObject: { Nested: red, Appearance: gray, Unused: unused } })
    const inner = source.context.register(source.context.flateStream('/Nested Do', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: shared,
    }))
    const outer = source.context.register(source.context.flateStream('/Inner Do', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: { XObject: { Inner: inner, Unused: unused } },
    }))
    const pattern = source.context.register(source.context.flateStream('q 10 0 0 10 0 0 cm /Outer Do Q', {
      Type: 'Pattern', PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 10, 10], XStep: 10, YStep: 10,
      Resources: { XObject: { Outer: outer, Unused: unused } },
    }))
    const appearance = source.context.register(source.context.flateStream('q 20 0 0 20 0 0 cm /Appearance Do Q', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 20, 20], Resources: shared,
    }))
    const page = source.addPage([100, 100])
    page.node.set(PDFName.of('Resources'), source.context.obj({ Pattern: { Tile: pattern } }))
    contents(source, page, '/Pattern cs /Tile scn 0 0 100 100 re f')
    page.node.set(PDFName.of('Annots'), source.context.obj([source.context.register(source.context.obj({
      Type: 'Annot', Subtype: 'Stamp', Rect: [40, 40, 60, 60], AP: { N: appearance },
    }))]))
    const file = await pdfFile(source)
    const { doc } = await openPdf(file)
    const slice = await slicePdf(doc, { from: 1, to: 1 }, 'nested.pdf')
    const result = await PDFDocument.load(await slice.arrayBuffer())
    expect(images(result)).toHaveLength(2)
    const expected = await renderPage(file)
    expect(new Set(expected).size).toBeGreaterThan(2) // דוגמת ה-Forms ומראה ההערה נראים, לא עמוד ריק
    expect(await renderPage(slice)).toEqual(expected)
  })

  test('שמות עם מילוט ומערכי תוכן נקראים בלי לפרש מחרוזות והערות כשימוש במשאב', async () => {
    const source = await PDFDocument.create()
    const page = source.addPage([100, 100])
    page.node.set(PDFName.of('Resources'), source.context.obj({ XObject: {
      'Image A': image(source, 1, 1, 80), Unused: image(source, 1, 1, 180),
    } }))
    page.node.set(PDFName.of('Contents'), source.context.obj([
      source.context.register(source.context.flateStream('% /Unused Do\n(/Unused \\(nested\\)) pop <2f556e75736564> pop q 100 0 0 100 0 0 cm /Ima')),
      source.context.register(source.context.flateStream('ge#20A Do Q')),
    ]))
    const file = await pdfFile(source)
    const { doc } = await openPdf(file)
    const slice = await slicePdf(doc, { from: 1, to: 1 }, 'escaped.pdf')
    expect(images(await PDFDocument.load(await slice.arrayBuffer()))).toHaveLength(1)
    expect(await renderPage(slice)).toEqual(await renderPage(file))
  })

  test('Form וגליף Type3 שמשתמשים במשאבי העמוד שומרים את התמונות ואת הפלט', async () => {
    const source = await PDFDocument.create()
    const inherited = source.context.register(source.context.flateStream('/FormImage Do', {
      Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1],
    }))
    const font = source.context.register(source.context.obj({
      Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 1, 1], FontMatrix: [1, 0, 0, 1, 0, 0],
      CharProcs: { A: source.context.register(source.context.flateStream('1 0 d0 /GlyphImage Do')) },
      Encoding: { Type: 'Encoding', Differences: [65, 'A'] }, FirstChar: 65, LastChar: 65, Widths: [1],
    }))
    const page = source.addPage([100, 50])
    page.node.set(PDFName.of('Resources'), source.context.obj({
      Font: { F1: font },
      XObject: { Inherited: inherited, FormImage: image(source, 1, 1, 80), GlyphImage: image(source, 1, 1, 180), Unused: image(source, 1, 1, 250) },
    }))
    contents(source, page, 'q 50 0 0 50 0 0 cm /Inherited Do Q BT /F1 50 Tf 50 0 Td (A) Tj ET')
    const file = await pdfFile(source)
    const { doc } = await openPdf(file)
    const slice = await slicePdf(doc, { from: 1, to: 1 }, 'glyph.pdf')
    expect(images(await PDFDocument.load(await slice.arrayBuffer()))).toHaveLength(2)
    const expected = await renderPage(file)
    expect(new Set(expected).size).toBeGreaterThan(2)
    expect(await renderPage(slice)).toEqual(expected)
  })

  test('תמונות מוטבעות וקידודי תוכן לא נתמכים שומרים את המשאבים בשלמותם', async () => {
    for (const mode of ['inline', 'encoding', 'predictor', 'malformed']) {
      const source = await PDFDocument.create()
      const page = source.addPage([100, 100])
      page.node.set(PDFName.of('Resources'), source.context.obj({ XObject: {
        Retained: image(source, 1, 1, 80), Extra: image(source, 1, 1, 180),
      } }))
      let stream = source.context.stream(
        mode === 'malformed' ? 'q ] Q' : 'q 100 0 0 100 0 0 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID \x50\x50\x50 EI Q',
        mode === 'encoding' ? { Filter: 'UnknownEncoding' } : {},
      )
      if (mode === 'predictor') {
        const content = new TextEncoder().encode('q 100 0 0 100 0 0 cm /Retained Do Q')
        stream = source.context.flateStream(new Uint8Array([0, ...content]), {
          DecodeParms: { Predictor: 15, Columns: content.length },
        })
      }
      page.node.set(PDFName.of('Contents'), source.context.register(stream))
      const file = await pdfFile(source)
      const { doc } = await openPdf(file)
      const slice = await slicePdf(doc, { from: 1, to: 1 }, 'conservative.pdf')
      expect(images(await PDFDocument.load(await slice.arrayBuffer()))).toHaveLength(2)
      if (mode === 'inline' || mode === 'predictor') expect(await renderPage(slice)).toEqual(await renderPage(file))
    }
  })
})
