// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// החסימה של תיקיות פרטיות ב-/uploads נבדקת אחרי resolve: מקטע מקודד (%2F..%2F), לוכסן-הפוך או רישיות
// לא עוקפים אותה. UPLOAD_DIR — תיקייה זמנית, לפני טעינת הראוט (UPLOAD_ROOT נקבע בטעינה).
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-route-'))
process.env.UPLOAD_DIR = root
fs.mkdirSync(path.join(root, 'tzurat-hadaf', 'berakhot'), { recursive: true })
fs.writeFileSync(path.join(root, 'tzurat-hadaf', 'berakhot', '002a.scan.png'), 'x')
fs.mkdirSync(path.join(root, 'books'), { recursive: true })
fs.writeFileSync(path.join(root, 'books', 'a.txt'), 'ok')

let GET
beforeAll(async () => {
  ;({ GET } = await import('./route'))
})
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const call = (segments) => GET(new Request('http://localhost/uploads/x'), { params: Promise.resolve({ path: segments }) })

describe('GET /uploads/[...path] — תיקיות חסומות', () => {
  it('קובץ רגיל מוגש', async () => {
    expect((await call(['books', 'a.txt'])).status).toBe(200)
  })

  it('חסום ישירות, ברישיות אחרת ובלוכסן-הפוך', async () => {
    for (const segs of [['tzurat-hadaf', 'berakhot', '002a.scan.png'], ['TZURAT-HADAF', 'berakhot', '002a.scan.png'], ['tzurat-hadaf\\berakhot\\002a.scan.png']]) {
      expect((await call(segs)).status, segs.join('/')).toBe(403)
    }
  })

  it('מקטע מפוענח עם ../ (מ-%2F..%2F) — עדיין חסום', async () => {
    for (const segs of [['books/../tzurat-hadaf/berakhot/002a.scan.png'], ['x', '..', 'tzurat-hadaf', 'berakhot', '002a.scan.png'], ['books\\..\\Tzurat-Hadaf', 'berakhot', '002a.scan.png']]) {
      expect((await call(segs)).status, segs.join('/')).toBe(403)
    }
  })

  it('יציאה מהשורש — 403', async () => {
    expect((await call(['..', '..', 'etc', 'passwd'])).status).toBe(403)
  })
})
