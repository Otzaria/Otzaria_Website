/**
 * woff2Ligatures.mjs — קורא מקובץ WOFF2 את רשימת הליגטורות (שמות האייקונים) שבו.
 *
 * גופן Material Symbols ממפה שם אייקון לגליף דרך ליגטורה: הרצף "close" מוחלף בגליף
 * של האייקון. מכאן שהרשימה המדויקת של האייקונים שבגופן היא רשימת הליגטורות בטבלת GSUB.
 * build-icon-font.mjs משתמש בזה כדי לוודא שכל אייקון שבשימוש באמת נכלל בגופן שהתקבל,
 * ולא לסמוך רק על גודל הקובץ.
 *
 * תמיכה מינימלית ומספיקה לגופן הזה: WOFF2 בודד (לא collection), cmap בפורמט 4 או 12,
 * ו-GSUB עם lookups מסוג 4 (Ligature), כולל עטיפת Extension (סוג 7).
 */

import { brotliDecompressSync } from 'node:zlib'

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

function readBase128(buf, pos) {
  let value = 0
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos.at++]
    value = value * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) return value
  }
  throw new Error('woff2: UIntBase128 לא תקין')
}

/** מפענח את מכולת ה-WOFF2 ומחזיר את הטבלאות הלא-מותמרות לפי tag. */
export function readWoff2Tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('woff2: חתימה שגויה')
  const numTables = buf.readUInt16BE(12)
  const totalCompressedSize = buf.readUInt32BE(20)
  const pos = { at: 48 }
  const entries = []
  for (let t = 0; t < numTables; t++) {
    const flags = buf[pos.at++]
    let tag = KNOWN_TAGS[flags & 0x3f]
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', pos.at, pos.at + 4)
      pos.at += 4
    }
    const version = (flags >> 6) & 3
    const origLength = readBase128(buf, pos)
    // glyf/loca: גרסה 0 = מותמרת; שאר הטבלאות: כל גרסה שאינה 0 = מותמרת
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    const length = transformed ? readBase128(buf, pos) : origLength
    entries.push({ tag, length, transformed })
  }
  if (buf.readUInt32BE(4) === 0x74746366) throw new Error('woff2: collection אינו נתמך')
  const data = brotliDecompressSync(buf.subarray(pos.at, pos.at + totalCompressedSize))
  const tables = new Map()
  let offset = 0
  for (const { tag, length, transformed } of entries) {
    if (!transformed) tables.set(tag, data.subarray(offset, offset + length))
    offset += length
  }
  return tables
}

/** glyphId → תו, מתוך cmap (פורמט 4 או 12). */
export function glyphToChar(cmap) {
  const map = new Map()
  const numTables = cmap.readUInt16BE(2)
  for (let i = 0; i < numTables; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4)
    const format = cmap.readUInt16BE(sub)
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(sub + 6)
      const ends = sub + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const ranges = deltas + segX2
      for (let s = 0; s < segX2; s += 2) {
        const end = cmap.readUInt16BE(ends + s)
        const start = cmap.readUInt16BE(starts + s)
        const delta = cmap.readInt16BE(deltas + s)
        const rangeOffset = cmap.readUInt16BE(ranges + s)
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let gid
          if (rangeOffset === 0) gid = (c + delta) & 0xffff
          else {
            const g = cmap.readUInt16BE(ranges + s + rangeOffset + (c - start) * 2)
            gid = g === 0 ? 0 : (g + delta) & 0xffff
          }
          if (gid && !map.has(gid)) map.set(gid, String.fromCodePoint(c))
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12
        const start = cmap.readUInt32BE(at)
        const end = cmap.readUInt32BE(at + 4)
        const gid0 = cmap.readUInt32BE(at + 8)
        for (let c = start; c <= end; c++) if (!map.has(gid0 + c - start)) map.set(gid0 + c - start, String.fromCodePoint(c))
      }
    }
  }
  return map
}

function coverageGlyphs(t, off) {
  const format = t.readUInt16BE(off)
  const out = []
  if (format === 1) {
    const n = t.readUInt16BE(off + 2)
    for (let i = 0; i < n; i++) out.push(t.readUInt16BE(off + 4 + i * 2))
  } else if (format === 2) {
    const n = t.readUInt16BE(off + 2)
    for (let i = 0; i < n; i++) {
      const at = off + 4 + i * 6
      for (let g = t.readUInt16BE(at); g <= t.readUInt16BE(at + 2); g++) out.push(g)
    }
  }
  return out
}

/** כל רצפי הליגטורות ב-GSUB, כמערכי glyphId (הגליף הראשון + הרכיבים). */
function ligatureSequences(gsub) {
  const lookupList = gsub.readUInt16BE(8)
  const lookupCount = gsub.readUInt16BE(lookupList)
  const seqs = []
  for (let l = 0; l < lookupCount; l++) {
    const lookup = lookupList + gsub.readUInt16BE(lookupList + 2 + l * 2)
    const type = gsub.readUInt16BE(lookup)
    const subCount = gsub.readUInt16BE(lookup + 4)
    for (let s = 0; s < subCount; s++) {
      let sub = lookup + gsub.readUInt16BE(lookup + 6 + s * 2)
      let subType = type
      if (type === 7) {
        subType = gsub.readUInt16BE(sub + 2)
        sub += gsub.readUInt32BE(sub + 4)
      }
      if (subType !== 4) continue
      const firsts = coverageGlyphs(gsub, sub + gsub.readUInt16BE(sub + 2))
      const setCount = gsub.readUInt16BE(sub + 4)
      for (let i = 0; i < setCount; i++) {
        const set = sub + gsub.readUInt16BE(sub + 6 + i * 2)
        const ligCount = gsub.readUInt16BE(set)
        for (let j = 0; j < ligCount; j++) {
          const lig = set + gsub.readUInt16BE(set + 2 + j * 2)
          const compCount = gsub.readUInt16BE(lig + 2)
          const seq = [firsts[i]]
          for (let k = 1; k < compCount; k++) seq.push(gsub.readUInt16BE(lig + 4 + (k - 1) * 2))
          seqs.push(seq)
        }
      }
    }
  }
  return seqs
}

/**
 * שמות האייקונים (הליגטורות) שבגופן WOFF2, ממוינים.
 * @param {Buffer} buf
 * @returns {string[]}
 */
export function woff2LigatureNames(buf) {
  const tables = readWoff2Tables(buf)
  const cmap = tables.get('cmap')
  const gsub = tables.get('GSUB')
  if (!cmap || !gsub) throw new Error('woff2: חסרה טבלת cmap או GSUB')
  const chars = glyphToChar(cmap)
  const names = new Set()
  for (const seq of ligatureSequences(gsub)) {
    const text = seq.map((g) => chars.get(g))
    if (text.every((c) => c !== undefined)) names.add(text.join(''))
  }
  return [...names].sort()
}
