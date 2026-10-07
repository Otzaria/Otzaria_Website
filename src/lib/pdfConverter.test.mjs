import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { convertPdfToImages } from './pdfConverter.js'

async function samplePdf() {
  const document = await PDFDocument.create()
  for (const color of [rgb(1, 0, 0), rgb(0, 0, 1)]) {
    const page = document.addPage([100, 100]); page.drawRectangle({ x: 0, y: 0, width: 100, height: 100, color })
  }
  return `data:application/pdf;base64,${Buffer.from(await document.save()).toString('base64')}`
}
test('patched PDF engine renders every page through the production converter', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'otzaria-pdf-'))
  try {
    const pages = await convertPdfToImages(await samplePdf(), dir, { width: 120, height: 160, scale: 2, filenamePrefix: 'scan' })
    assert.equal(pages.length, 2)
    for (const [i, page] of pages.entries()) {
      assert.equal(page.page, i + 1); assert.equal(page.path, path.join(dir, `scan.${i + 1}.jpg`))
      const metadata = await sharp(page.path).metadata(); assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 120); assert.equal(metadata.height, 120)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('rendering failure releases PDF resources and later conversion still works', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'otzaria-pdf-error-'))
  try {
    const source = await samplePdf()
    await assert.rejects(convertPdfToImages(source, path.join(dir, 'missing')), /unable to open|ENOENT|No such file/i)
    const pages = await convertPdfToImages(source, dir); assert.equal(pages.length, 2)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
