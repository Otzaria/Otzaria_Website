import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADDITIONAL_SOURCES,
  DEVELOPERS,
  EDITOR_GROUPS,
  EMERGENCY_LINES,
  ESSENTIAL_PEOPLE,
  MAIN_SOURCES,
  MEMORIALS,
  PAGE_SECTIONS,
  SPONSOR_COMPANIES,
  SUPPORT_ORGS,
  isLinkable,
  orgDetailLines,
  splitBold,
  telHref,
  withThousandsSeparator
} from './chachmei-lev-data.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const publicFile = (p) => path.join(ROOT, 'public', p)
const ICONS = new Set(JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'icon-font.manifest.json'), 'utf8')).icons)

test('withThousandsSeparator: מפריד אלפים כמו בתוכנה', () => {
  assert.equal(withThousandsSeparator(102631), '102,631')
  assert.equal(withThousandsSeparator(999), '999')
  assert.equal(withThousandsSeparator(1000000), '1,000,000')
})

test('orgDetailLines: מחליף {registered} בכמות הנרשמים, ומשאיר שורות בלי כמות כמו שהן', () => {
  const lines = orgDetailLines({ registeredCount: 111220, details: ['7 - כמות (מעל {registered})', 'א'] })
  assert.deepEqual(lines, ['7 - כמות (מעל 111,220)', 'א'])
  assert.deepEqual(orgDetailLines({ details: ['{registered}'] }), ['{registered}'])
  assert.deepEqual(orgDetailLines({}), [])
})

test('splitBold: מקטעים מודגשים בלי הכוכביות; כוכבית בודדת נשארת טקסט', () => {
  assert.deepEqual(splitBold('4 - **לדיווח חירום** עכשיו'), [
    { text: '4 - ', bold: false },
    { text: 'לדיווח חירום', bold: true },
    { text: ' עכשיו', bold: false }
  ])
  assert.deepEqual(splitBold('* - מוקד חרום'), [{ text: '* - מוקד חרום', bold: false }])
  assert.deepEqual(splitBold(''), [])
})

test('telHref: ספרות, כוכבית וסולמית בלבד', () => {
  assert.equal(telHref('073-888-1234'), 'tel:0738881234')
  assert.equal(telHref('*5172'), 'tel:*5172')
})

test('isLinkable: רק http(s)', () => {
  assert.equal(isLinkable('https://github.com/x'), true)
  assert.equal(isLinkable('http://mobile.tora.ws'), true)
  assert.equal(isLinkable(''), false)
  assert.equal(isLinkable(undefined), false)
  assert.equal(isLinkable('javascript:alert(1)'), false)
})

test('הקדשות: שתי ההקדשות בנוסח המדויק מהתוכנה', () => {
  assert.equal(MEMORIALS.length, 2)
  assert.equal(MEMORIALS[0].title, 'לע"נ ר\' משה בן יהודה ראה ז"ל')
  assert.match(MEMORIALS[1].title, /^לע"נ ר' משה ב"ר פרץ ובנו ר' יצחק ב"ר משה, והאשה הכשרה מרת רחל יהודית בת אליעזר$/)
  assert.equal(MEMORIALS[1].description.split('\n').length, 2)
})

test('כל לוגו קיים בתיקיית public', () => {
  const logos = [
    ...MAIN_SOURCES, ...ADDITIONAL_SOURCES, ...SPONSOR_COMPANIES, ...EMERGENCY_LINES, ...SUPPORT_ORGS
  ].map((item) => item.logo).filter(Boolean)
  assert.ok(logos.length > 20)
  for (const logo of logos) assert.ok(existsSync(publicFile(logo)), `חסר קובץ: ${logo}`)
})

test('מקור עם לוגו מגדיר יחס רוחב/גובה חיובי', () => {
  for (const source of [...MAIN_SOURCES, ...ADDITIONAL_SOURCES]) {
    if (!source.logo) continue
    assert.ok(source.ratio > 0, source.name)
  }
})

test('כל קישור באנשים, במקורות ובחברות הוא http(s) או ריק', () => {
  const people = [...ESSENTIAL_PEOPLE, ...DEVELOPERS, ...EDITOR_GROUPS.flatMap((g) => g.editors)]
  for (const item of [...people, ...MAIN_SOURCES, ...ADDITIONAL_SOURCES, ...SPONSOR_COMPANIES]) {
    if (item.url === undefined) continue
    assert.ok(isLinkable(item.url), `${item.name}: ${item.url}`)
    // אחוז-קידוד תקין (הכתובת השבורה מהתוכנה תוקנה)
    assert.doesNotThrow(() => decodeURI(item.url), item.name)
  }
})

test('שמות לא כפולים בתוך כל רשימה', () => {
  for (const list of [DEVELOPERS, ESSENTIAL_PEOPLE, ADDITIONAL_SOURCES, ...EDITOR_GROUPS.map((g) => g.editors)]) {
    const names = list.map((item) => item.name)
    assert.equal(new Set(names).size, names.length)
  }
})

test('ניווט מהיר: לפי סדר הדף (לוח ההנצחה ראשון), מזהים ייחודיים ואייקונים שקיימים בגופן', () => {
  const ids = PAGE_SECTIONS.map((s) => s.id)
  assert.deepEqual(ids, ['memorial', 'companies', 'contributors', 'developers', 'library', 'aid'])
  // שישה שבבים: שורה אחת במחשב, שתי שורות של שלושה בנייד — בלי שבב בודד
  assert.equal(PAGE_SECTIONS.length % 3, 0)
  assert.equal(new Set(ids).size, ids.length)
  for (const section of PAGE_SECTIONS) assert.ok(ICONS.has(section.icon), section.icon)
})

test('ארגוני הסיוע: שם, טלפון ולוגו לכל ארגון', () => {
  assert.equal(EMERGENCY_LINES.length, 2)
  assert.equal(SUPPORT_ORGS.length, 9)
  for (const org of [...EMERGENCY_LINES, ...SUPPORT_ORGS]) {
    assert.ok(org.name && org.phone && org.logo, org.name)
    assert.ok(Array.isArray(org.details))
  }
})

test('slotMailto: המייל של אוצריא עם נושא מקודד', async () => {
  const { slotMailto, SLOT_EMAIL } = await import('./chachmei-lev-data.js')
  assert.equal(SLOT_EMAIL, 'otzaria.1@gmail.com')
  const href = slotMailto('הנצחה & תרומה')
  assert.ok(href.startsWith('mailto:otzaria.1@gmail.com?subject='))
  assert.equal(decodeURIComponent(href.split('subject=')[1]), 'הנצחה & תרומה')
})
