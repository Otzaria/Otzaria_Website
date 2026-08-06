#!/usr/bin/env node
/**
 * optimize-assets.mjs — יוצר את נכסי התמונה שמוגשים לדפדפן מתוך המקורות שב-assets/.
 *
 * למה: הנכסים המקוריים הוגשו כמו שהם. logo.svg היה מעטפת SVG סביב PNG של
 * 1024×1024 בבסיס-64 (2.23MB, 1.68MB דחוס) שהוצג לעיתים ב-32×32; image.png שקל
 * 1.97MB ונטען כרקע בכל דף באתר ב-15% אטימות. יחד — כ-3.6MB בכל ביקור קר.
 *
 * המקורות (assets/) אינם מוגשים לדפדפן. הפלטים (public/) נשמרים ב-Git.
 *
 * שימוש:
 *   node scripts/optimize-assets.mjs      # או: npm run build:assets
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'assets')
const PUBLIC = path.join(ROOT, 'public')
const APP = path.join(ROOT, 'src', 'app')

// הלוגו מוצג לכל היותר ב-128px (הירו בדף הבית) — 256px נותן 2x לצפיפות גבוהה.
const LOGO_SIZE = 256
// רקע הדף: הרזולוציה המקורית. הוא מוצג ב-15% אטימות ולכן איכות נמוכה אינה מורגשת.
const BG_WIDTH = 1376
const BG_AVIF_QUALITY = 40
const BG_WEBP_QUALITY = 50

/** שולף את ה-PNG המוטמע בבסיס-64 מתוך מעטפת ה-SVG של הלוגו המרובע. */
async function squareLogoMaster() {
  const svg = await readFile(path.join(ASSETS, 'logo-square-master.svg'), 'utf8')
  const base64 = svg.match(/base64,\s*([A-Za-z0-9+/=]+)/)?.[1]
  if (!base64) throw new Error('logo-square-master.svg: לא נמצא PNG מוטמע')
  return Buffer.from(base64, 'base64')
}

const report = []

async function emit(target, buffer) {
  await writeFile(target, buffer)
  report.push(`${path.relative(ROOT, target)} — ${(buffer.length / 1024).toFixed(1)}KB`)
}

async function main() {
  const square = await squareLogoMaster()

  // לוגו מרובע (כותרות, הירו, ברירת מחדל לתוספים) — WebP.
  await emit(
    path.join(PUBLIC, 'logo.webp'),
    await sharp(square).resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toBuffer()
  )

  // לוגו בגזירה הצרה — נשאר PNG: הוא מוטמע גם במיילים, ושם התמיכה ב-WebP חלקית.
  await emit(
    path.join(PUBLIC, 'logo.png'),
    await sharp(path.join(ASSETS, 'logo-master.png')).resize({ width: LOGO_SIZE }).png({ compressionLevel: 9, palette: true }).toBuffer()
  )

  // אייקוני האתר. Next מזהה את app/icon.png ו-app/apple-icon.png אוטומטית,
  // מוסיף להם hash ומגיש אותם עם cache ארוך — במקום favicon של 1.68MB.
  await emit(
    path.join(APP, 'icon.png'),
    await sharp(square).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true, colors: 128 }).toBuffer()
  )
  await emit(
    path.join(APP, 'apple-icon.png'),
    // iOS אינו מכבד שקיפות ומצייר רקע שחור — לכן משטיחים על לבן.
    await sharp(square).resize(180, 180, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png({ compressionLevel: 9, palette: true, colors: 128 }).toBuffer()
  )

  // רקע הדף — AVIF עם נפילה ל-WebP (styles/base.css משתמש ב-image-set).
  const bg = sharp(path.join(ASSETS, 'background-master.png')).resize({ width: BG_WIDTH, withoutEnlargement: true })
  await emit(path.join(PUBLIC, 'bg.avif'), await bg.clone().avif({ quality: BG_AVIF_QUALITY }).toBuffer())
  await emit(path.join(PUBLIC, 'bg.webp'), await bg.clone().webp({ quality: BG_WEBP_QUALITY }).toBuffer())

  console.log(`✓ נוצרו ${report.length} נכסים:`)
  for (const line of report) console.log(`   ${line}`)
}

main().catch((err) => {
  console.error(`✗ optimize-assets: ${err.message}`)
  process.exit(1)
})
