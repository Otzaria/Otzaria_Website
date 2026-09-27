#!/usr/bin/env node
/**
 * page-proof-link-import.mjs — ייבוא חבילת-עמודים של תוכנת-הספר להגהת-העמודים
 * באתר ב"מצב-קישור": בלי להעלות תמונות — כל עמוד מצביע לתמונת-העמוד שכבר
 * קיימת בספר שהועלה לאתר (/uploads/books/<slug>/page.N.jpg). רץ מקומית ונוגע
 * רק במסד (MONGODB_URI מ-.env.local).
 *
 * הזרימה: מעלים את ה-PDF בשירות ההעלאה של האתר → מריצים מקומית את המנוע על
 * אותו PDF (book-cli.bat run … --out <תיקייה>) → הסקריפט הזה.
 *
 * למה זה עובד: האתר ותוכנת-הספר מרנדרים את אותו עמוד PDF, כל אחד ברזולוציה
 * שלו — יחס-הממדים זהה. הקואורדינטות נשמרות במרחב של תוכנת-הספר (doc.size,
 * ולכן גם קובץ-התיקונים), והעורך מותח את תמונת-האתר על אותו viewBox.
 *
 * עמוד שהמנוע יישר (הטיה/עיקום — prep/flatten) כבר אינו תואם פיקסל-לפיקסל
 * לתמונת-האתר. הסקריפט משווה כל עמוד לתמונת-האתר; עמוד חורג נכתב ל-ZIP קטן
 * (עם התמונה של המנוע) שמעלים בכפתור הייבוא במסך הניהול.
 *
 * שימוש:
 *   node scripts/page-proof-link-import.mjs --package <תיקיית-החבילה> --book <slug-באתר> [--site https://otzaria.org]
 *        [--double-pct 10] [--max-diff 6] [--dry-run]
 *
 * הסף (--max-diff): עמוד שהמנוע לא שינה נותן כאן 3–5 (תמונת-האתר היא JPEG
 * מרנדרר אחר ברזולוציה נמוכה); עמוד שיושר — 12 ומעלה (נמדד על "חכמת אדם",
 * 28/09/2026). עדיף להעלות עמוד מיותר מאשר לקשר עמוד שהתיבות שלו לא ייפלו עליו.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import sharp from 'sharp'
import { zipSync } from 'fflate'

import Book from '../src/models/Book.js'
import Page from '../src/models/Page.js'
import { parsePackageEntries } from '../src/lib/pageProof/packageParse.js'
import { importPackages } from '../src/lib/pageProof/importPackages.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })
dotenv.config({ path: path.join(ROOT, '.env') })

function args() {
  const a = process.argv.slice(2)
  const out = { site: 'https://otzaria.org', doublePct: 10, maxDiff: 6, dryRun: false }
  for (let i = 0; i < a.length; i++) {
    const k = a[i]
    if (k === '--package') out.pkg = a[++i]
    else if (k === '--book') out.book = a[++i]
    else if (k === '--site') out.site = a[++i].replace(/\/$/, '')
    else if (k === '--double-pct') out.doublePct = Number(a[++i])
    else if (k === '--max-diff') out.maxDiff = Number(a[++i])
    else if (k === '--dry-run') out.dryRun = true
  }
  if (!out.pkg || !out.book) {
    console.error(
      'שימוש: --package <תיקייה> --book <slug> [--site URL] [--double-pct N] [--max-diff N] [--dry-run]\n' +
        'בסביבה עם סינון-רשת: NODE_OPTIONS=--use-openssl-ca'
    )
    process.exit(2)
  }
  return out
}

// תיקיית-החבילה → מפת קבצים כמו של fflate (נתיבים יחסיים בלוכסן קדימה)
function readDir(dir, prefix = 'pkg/') {
  const out = {}
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) Object.assign(out, readDir(p, `${prefix}${name}/`))
    else out[prefix + name] = new Uint8Array(fs.readFileSync(p))
  }
  return out
}

async function fetchImage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ל-${url}`)
  return Buffer.from(await res.arrayBuffer())
}

// הפרש ממוצע (0–255) בין תמונת-המנוע לתמונת-האתר, בגודל של תמונת-האתר.
// עמוד שלא שונה: הפרשי דגימה/דחיסה בלבד (ספרה בודדת); יישור של חצי מעלה
// מזיז שורות בפיקסלים שלמים ומקפיץ את ההפרש (ראו הסף בראש הקובץ).
async function meanDiff(engineBytes, siteBuf, w, h) {
  const a = await sharp(Buffer.from(engineBytes)).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer()
  const b = await sharp(siteBuf).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer()
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

async function main() {
  const o = args()
  const entries = readDir(path.resolve(o.pkg))
  const { packages, errors } = parsePackageEntries(entries)
  if (errors.length) console.warn('אזהרות בחבילה:\n  ' + errors.join('\n  '))
  if (packages.length !== 1) throw new Error(`נדרשת חבילה אחת בתיקייה (נמצאו ${packages.length})`)
  const pkg = packages[0]

  console.log(`🔌 מתחבר: ${String(process.env.MONGODB_URI).replace(/\/\/[^@]*@/, '//***@')}`)
  await mongoose.connect(process.env.MONGODB_URI)

  const book = await Book.findOne({ slug: o.book }).lean()
  if (!book) throw new Error(`הספר לא נמצא באתר (slug=${o.book})`)
  const sitePages = new Map((await Page.find({ book: book._id }, { pageNumber: 1, imagePath: 1 }).lean()).map((p) => [p.pageNumber, p]))
  console.log(`📘 ${book.name}: ${sitePages.size} עמודים באתר · ${pkg.pages.length} עמודים בחבילה`)

  const links = new Map()
  const upload = []
  for (const { doc, imagePath } of pkg.pages) {
    const sp = sitePages.get(doc.page)
    if (!sp) {
      console.warn(`  עמוד ${doc.page}: אין עמוד כזה בספר באתר — דילוג`)
      continue
    }
    const siteBuf = await fetchImage(o.site + encodeURI(sp.imagePath))
    const meta = await sharp(siteBuf).metadata()
    const [W, H] = doc.size
    const aspectErr = Math.abs(W * meta.height - H * meta.width) / (W * meta.height)
    const diff = await meanDiff(entries[imagePath], siteBuf, meta.width, meta.height)
    const ok = aspectErr < 0.01 && diff <= o.maxDiff
    console.log(
      `  עמוד ${doc.page}: מנוע ${W}×${H} · אתר ${meta.width}×${meta.height} · סטיית-יחס ${(aspectErr * 100).toFixed(2)}% · הפרש ${diff.toFixed(1)} → ${ok ? 'קישור' : 'העלאה'}`
    )
    if (ok) links.set(doc.page, { imagePath: sp.imagePath, width: meta.width, height: meta.height, sitePage: sp._id })
    else upload.push({ doc, imagePath })
  }

  if (upload.length) {
    // חבילה-חלקית עם תמונות המנוע — להעלאה בכפתור הייבוא (ממוזגת לפי gid)
    const files = {}
    const meta = { contract: 1, gid: pkg.meta.gid, title: book.name, script: pkg.meta.script, pages: [] }
    for (const { doc, imagePath } of upload) {
      const img = `pages/p${String(doc.page).padStart(3, '0')}.png`
      files[`pkg/עמוד-${String(doc.page).padStart(3, '0')}.json`] = new TextEncoder().encode(JSON.stringify({ ...doc, image: img }))
      files[`pkg/${img}`] = entries[imagePath]
      meta.pages.push({ page: doc.page, file: `עמוד-${String(doc.page).padStart(3, '0')}.json`, image: img, lines: doc.lines.length })
    }
    files['pkg/חבילה.json'] = new TextEncoder().encode(JSON.stringify(meta))
    const zipPath = path.resolve(o.pkg) + '-להעלאה.zip'
    fs.writeFileSync(zipPath, zipSync(files, { level: 0 }))
    console.log(`📦 ${upload.length} עמודים שיושרו במנוע — להעלות בכפתור הייבוא במסך הניהול:\n   ${zipPath}`)
  }

  if (o.dryRun) {
    console.log('— dry-run: לא נכתב דבר למסד —')
  } else if (links.size) {
    const linked = { ...pkg, pages: pkg.pages.filter((p) => links.has(p.doc.page)) }
    const res = await importPackages([linked], entries, { links, siteBook: book._id, title: book.name, doublePct: o.doublePct })
    console.log('✅', JSON.stringify(res))
  }
  await mongoose.disconnect()
}

main().catch(async (e) => {
  console.error('❌', e.message)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
