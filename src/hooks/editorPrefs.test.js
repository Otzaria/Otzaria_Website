import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EDITOR_PREFS,
  EDITOR_PREFS_VERSION,
  editorPrefsEqual,
  mergeEditorPrefs,
  parseStoredEditorPrefs,
  sanitizeEditorPrefs,
  serializeEditorPrefs,
  validatePref,
  legacyEditorPrefsPatch,
  legacyTextAlignPatch,
  migrateLegacyEditorPrefs,
  EDITOR_PREFS_STORAGE_KEY as PREFS_KEY
} from './editorPrefs'

describe('validatePref', () => {
  it('ערכי בחירה — רק מהרשימה', () => {
    expect(validatePref('theme', 'paper')).toBe('paper')
    expect(validatePref('theme', 'dark')).toBeUndefined()
    expect(validatePref('lineSpacing', 'fixed')).toBe('fixed')
  })

  it('בוליאני — רק true/false', () => {
    expect(validatePref('lineStrip', true)).toBe(true)
    expect(validatePref('lineStrip', 'true')).toBeUndefined()
  })

  it('מספר — נחתך לטווח ומעוגל; לא-מספר נפסל', () => {
    expect(validatePref('fontSize', 60)).toBe(40)
    expect(validatePref('fontSize', 3)).toBe(12)
    expect(validatePref('fontSize', 18.6)).toBe(19)
    expect(validatePref('fontSize', NaN)).toBeUndefined()
    expect(validatePref('fontSize', '18')).toBeUndefined()
  })

  it('שדה לא מוכר — undefined', () => {
    expect(validatePref('__proto__', {})).toBeUndefined()
    expect(validatePref('other', 1)).toBeUndefined()
  })
})

describe('sanitizeEditorPrefs', () => {
  it('לא-אובייקט → ברירות מחדל', () => {
    expect(sanitizeEditorPrefs(null)).toEqual(DEFAULT_EDITOR_PREFS)
    expect(sanitizeEditorPrefs([1, 2])).toEqual(DEFAULT_EDITOR_PREFS)
  })

  it('שומר שדות תקפים, מחליף פסולים וזורק זרים', () => {
    const out = sanitizeEditorPrefs({ theme: 'evening', fontSize: 'big', extra: 1 })
    expect(out.theme).toBe('evening')
    expect(out.fontSize).toBe(DEFAULT_EDITOR_PREFS.fontSize)
    expect(out).not.toHaveProperty('extra')
  })
})

describe('mergeEditorPrefs', () => {
  it('מעדכן רק שדות תקפים', () => {
    const out = mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { fontFamily: 'frank', theme: 'neon' })
    expect(out.fontFamily).toBe('frank')
    // גופני "בלי תגים" — ערכים תקפים, נשמרים כמו שהם
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { fontFamily: 'noto' }).fontFamily).toBe('noto')
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { fontFamily: 'sans' }).fontFamily).toBe('sans')
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { fontFamily: 'heebo' }).fontFamily).toBe('frank')
    expect(out.theme).toBe('light')
  })

  it('patch שאינו אובייקט — ללא שינוי', () => {
    expect(mergeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, lineStrip: true }, null).lineStrip).toBe(true)
  })
})

describe('אחסון', () => {
  it('הלוך-חזור דרך serialize/parse', () => {
    const prefs = { ...DEFAULT_EDITOR_PREFS, theme: 'paper', scanContrast: 120 }
    const text = serializeEditorPrefs(prefs)
    expect(JSON.parse(text).version).toBe(EDITOR_PREFS_VERSION)
    expect(parseStoredEditorPrefs(text)).toEqual(prefs)
  })

  it('JSON שבור או ריק → ברירות מחדל', () => {
    expect(parseStoredEditorPrefs('{oops')).toEqual(DEFAULT_EDITOR_PREFS)
    expect(parseStoredEditorPrefs('')).toEqual(DEFAULT_EDITOR_PREFS)
    expect(parseStoredEditorPrefs(null)).toEqual(DEFAULT_EDITOR_PREFS)
  })

  it('רשומה ישנה בלי version (אובייקט שטוח) — שדות תקפים נשמרים', () => {
    expect(parseStoredEditorPrefs(JSON.stringify({ fontSize: 22 })).fontSize).toBe(22)
  })

  it('רשומה מגרסה 1 (בלי עוצמת סימון) → עוצמה "חזק", שאר השדות נשמרים', () => {
    const v1 = JSON.stringify({ version: 1, prefs: { ...DEFAULT_EDITOR_PREFS, highlightStrength: undefined, fontSize: 24 } })
    const prefs = parseStoredEditorPrefs(v1)
    expect(prefs.highlightStrength).toBe('strong')
    expect(prefs.fontSize).toBe(24)
  })

  it('ברירת המחדל של גופן ההקלדה — פרנק ריהל', () => {
    expect(DEFAULT_EDITOR_PREFS.fontFamily).toBe('frank')
    expect(EDITOR_PREFS_VERSION).toBe(7)
  })

  it('רשומה מגרסה 2 או בלי version → פרנק ריהל פעם אחת, שאר השדות נשמרים', () => {
    const v2 = JSON.stringify({ version: 2, prefs: { ...DEFAULT_EDITOR_PREFS, fontFamily: 'assistant', theme: 'paper' } })
    expect(parseStoredEditorPrefs(v2)).toMatchObject({ fontFamily: 'frank', theme: 'paper' })
    expect(parseStoredEditorPrefs(JSON.stringify({ fontFamily: 'assistant' })).fontFamily).toBe('frank')
  })

  it('גופני "בלי תגים" החדשים נשמרים אחרי רענון; ערך לא מוכר שמור → פרנק ריהל', () => {
    for (const fontFamily of ['ibmPlex', 'googleSans', 'openSans']) {
      expect(parseStoredEditorPrefs(serializeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, fontFamily })).fontFamily).toBe(fontFamily)
    }
    const stored = JSON.stringify({ version: EDITOR_PREFS_VERSION, prefs: { ...DEFAULT_EDITOR_PREFS, fontFamily: 'comicSans', theme: 'paper' } })
    const parsed = parseStoredEditorPrefs(stored)
    expect(parsed.fontFamily).toBe('frank')
  })

  it('מגרסה 3 — בחירה ב"אסיסטנט" נשמרת', () => {
    const text = serializeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, fontFamily: 'assistant' })
    expect(parseStoredEditorPrefs(text).fontFamily).toBe('assistant')
  })

  it('תצוגת הטקסט: ברירת מחדל מעוצבת; רק rich/code תקפים', () => {
    expect(DEFAULT_EDITOR_PREFS.textView).toBe('rich')
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { textView: 'code' }).textView).toBe('code')
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { textView: 'html' }).textView).toBe('rich')
  })

  it('רשומה מגרסה 3 → תצוגה מעוצבת, שאר הבחירות נשמרות; מגרסה 4 — "קוד" נשמר', () => {
    const v3 = JSON.stringify({ version: 3, prefs: { ...DEFAULT_EDITOR_PREFS, fontFamily: 'assistant', textView: 'code' } })
    expect(parseStoredEditorPrefs(v3)).toMatchObject({ fontFamily: 'assistant', textView: 'rich' })
    const v4 = serializeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, textView: 'code' })
    expect(parseStoredEditorPrefs(v4).textView).toBe('code')
  })

  it('עימוד ספר (חלון / סיום משולש): ברירת מחדל כבוי (מגרסה 6); בוליאני בלבד', () => {
    expect(DEFAULT_EDITOR_PREFS).toMatchObject({ paraWindow: false, paraFunnel: false })
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { paraWindow: true }).paraWindow).toBe(true)
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { paraFunnel: 'yes' }).paraFunnel).toBe(false)
  })

  it('רשומה מגרסה 4 → עימוד ספר כבוי (ברירת המחדל), שאר הבחירות נשמרות', () => {
    const v4 = JSON.stringify({ version: 4, prefs: { ...DEFAULT_EDITOR_PREFS, textView: 'code', paraWindow: true, paraFunnel: true } })
    expect(parseStoredEditorPrefs(v4)).toMatchObject({ textView: 'code', paraWindow: false, paraFunnel: false })
  })

  it('רשומה מגרסה 5: שניהם דלוקים (ברירת המחדל הישנה) → כבויים; כיבוי מפורש של אחד נשמר', () => {
    const v5 = (prefs) => JSON.stringify({ version: 5, prefs: { ...DEFAULT_EDITOR_PREFS, ...prefs } })
    expect(parseStoredEditorPrefs(v5({ paraWindow: true, paraFunnel: true }))).toMatchObject({ paraWindow: false, paraFunnel: false })
    expect(parseStoredEditorPrefs(v5({ paraWindow: false, paraFunnel: true }))).toMatchObject({ paraWindow: false, paraFunnel: true })
    expect(parseStoredEditorPrefs(v5({ paraWindow: true, paraFunnel: false }))).toMatchObject({ paraWindow: true, paraFunnel: false })
    // מגרסה 6 — הדלקה של שניהם נשמרת
    const v6 = serializeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, paraWindow: true, paraFunnel: true })
    expect(parseStoredEditorPrefs(v6)).toMatchObject({ paraWindow: true, paraFunnel: true })
  })

  it('ריווח שורות ורווח בין פסקאות: ברירות מחדל "מרווח" ו"גדול"; רק ערכים מהרשימה', () => {
    expect(DEFAULT_EDITOR_PREFS).toMatchObject({ lineSpacing: 'facing', lineHeight: 'relaxed', paraSpacing: 'large' })
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { lineHeight: 'loose', paraSpacing: 'medium' })).toMatchObject({ lineHeight: 'loose', paraSpacing: 'medium' })
    expect(validatePref('lineHeight', 2.4)).toBeUndefined()
    expect(validatePref('paraSpacing', 'huge')).toBeUndefined()
  })

  it('רשומה מגרסה 5 → גובה השורה כמו קודם: "קבוע" → צפוף, "מול הסריקה" → רגיל; סידור השורות נשמר', () => {
    const v5 = (prefs) => JSON.stringify({ version: 5, prefs: { ...DEFAULT_EDITOR_PREFS, lineHeight: undefined, paraSpacing: undefined, ...prefs } })
    expect(parseStoredEditorPrefs(v5({ lineSpacing: 'fixed' }))).toMatchObject({ lineSpacing: 'fixed', lineHeight: 'compact', paraSpacing: 'large' })
    expect(parseStoredEditorPrefs(v5({ lineSpacing: 'facing' }))).toMatchObject({ lineSpacing: 'facing', lineHeight: 'relaxed', paraSpacing: 'large' })
    // בלי version (גרסה 1) — אותו מעבר
    expect(parseStoredEditorPrefs(JSON.stringify({ lineSpacing: 'fixed' })).lineHeight).toBe('compact')
    // מגרסה 6 — הבחירה נשמרת גם כשהיא לא תואמת את סידור השורות
    const v6 = serializeEditorPrefs({ ...DEFAULT_EDITOR_PREFS, lineSpacing: 'fixed', lineHeight: 'loose', paraSpacing: 'large' })
    expect(JSON.parse(v6).version).toBe(7)
    expect(parseStoredEditorPrefs(v6)).toMatchObject({ lineSpacing: 'fixed', lineHeight: 'loose', paraSpacing: 'large' })
    // גרסה 6 → 7: מי שנשאר על ברירות המחדל הקודמות (רגיל + בלי) עובר ל"מרווח" ו"גדול"; בחירה אחרת נשמרת
    const v6rec = (prefs) => JSON.stringify({ version: 6, prefs: { ...DEFAULT_EDITOR_PREFS, ...prefs } })
    expect(parseStoredEditorPrefs(v6rec({ lineHeight: 'normal', paraSpacing: 'none' }))).toMatchObject({ lineHeight: 'relaxed', paraSpacing: 'large' })
    expect(parseStoredEditorPrefs(v6rec({ lineHeight: 'compact', paraSpacing: 'none' }))).toMatchObject({ lineHeight: 'compact', paraSpacing: 'none' })
  })

  it('עוצמת סימון: רק strong/normal תקפים', () => {
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { highlightStrength: 'normal' }).highlightStrength).toBe('normal')
    expect(mergeEditorPrefs(DEFAULT_EDITOR_PREFS, { highlightStrength: 'huge' }).highlightStrength).toBe('strong')
  })

  it('editorPrefsEqual משווה לפי השדות המוכרים', () => {
    expect(editorPrefsEqual(DEFAULT_EDITOR_PREFS, { ...DEFAULT_EDITOR_PREFS })).toBe(true)
    expect(editorPrefsEqual(DEFAULT_EDITOR_PREFS, { ...DEFAULT_EDITOR_PREFS, lineStrip: true })).toBe(false)
  })
})

describe('legacyEditorPrefsPatch', () => {
  it('גופן serif ישן → פרנק; sans/monospace → אסיסטנט', () => {
    expect(legacyEditorPrefsPatch({ selectedFont: "'Times New Roman'" })).toEqual({ fontFamily: 'frank' })
    expect(legacyEditorPrefsPatch({ selectedFont: 'Georgia' })).toEqual({ fontFamily: 'frank' })
    expect(legacyEditorPrefsPatch({ selectedFont: 'Arial' })).toEqual({ fontFamily: 'assistant' })
    expect(legacyEditorPrefsPatch({ selectedFont: 'monospace' })).toEqual({ fontFamily: 'assistant' })
    expect(legacyEditorPrefsPatch({ selectedFont: 'sans-serif' })).toEqual({ fontFamily: 'assistant' })
  })

  it('גודל ישן → fontSize בטווח', () => {
    expect(legacyEditorPrefsPatch({ textZoom: '17' })).toEqual({ fontSize: 17 })
    expect(legacyEditorPrefsPatch({ textZoom: '60' })).toEqual({ fontSize: 40 })
    expect(legacyEditorPrefsPatch({ textZoom: 'abc' })).toEqual({})
  })

  it('בלי הגדרות ישנות — אובייקט ריק', () => {
    expect(legacyEditorPrefsPatch({ selectedFont: null, textZoom: null })).toEqual({})
    expect(legacyEditorPrefsPatch()).toEqual({})
  })
})

describe('יישור הטקסט (textAlign, גרסה 4)', () => {
  it('ברירת המחדל — לשני הצדדים', () => {
    expect(DEFAULT_EDITOR_PREFS.textAlign).toBe('justify')
    expect(validatePref('textAlign', 'center')).toBe('center')
    expect(validatePref('textAlign', 'start')).toBeUndefined()
  })

  it('רשומה מגרסה קודמת עוברת ליישור לשני הצדדים פעם אחת; מגרסה 4 הבחירה נשמרת', () => {
    expect(parseStoredEditorPrefs(JSON.stringify({ version: 3, prefs: { fontSize: 20 } })).textAlign).toBe('justify')
    expect(parseStoredEditorPrefs(JSON.stringify({ version: 4, prefs: { textAlign: 'right' } })).textAlign).toBe('right')
  })

  it('היישור הישן: "ימין" (ברירת המחדל הישנה) → כלום; בחירה אחרת נשמרת; ערך פסול נזרק', () => {
    expect(legacyTextAlignPatch('right')).toEqual({})
    expect(legacyTextAlignPatch('center')).toEqual({ textAlign: 'center' })
    expect(legacyTextAlignPatch('justify')).toEqual({ textAlign: 'justify' })
    expect(legacyTextAlignPatch('bogus')).toEqual({})
    expect(legacyTextAlignPatch(null)).toEqual({})
  })
})

function memStorage(init) {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => { m.delete(k) }, keys: () => [...m.keys()] }
}

describe('migrateLegacyEditorPrefs', () => {
  it('אין רשומת העדפות — מעביר ומוחק את המפתחות הישנים', () => {
    const st = memStorage({ selectedFont: 'Georgia', textZoom: '20', textAlign: 'center', 'otzaria-editor-prefs-legacy-migrated': '1' })
    expect(migrateLegacyEditorPrefs(st)).toEqual({ fontFamily: 'frank', fontSize: 20, textAlign: 'center' })
    expect(st.keys()).toEqual([])
  })
  it('יש כבר רשומת העדפות — לא דורס (patch ריק), ובכל זאת מוחק את השאריות', () => {
    const st = memStorage({ [PREFS_KEY]: '{}', selectedFont: 'Georgia', textZoom: '20', textAlign: 'center' })
    expect(migrateLegacyEditorPrefs(st)).toEqual({})
    expect(st.keys()).toEqual([PREFS_KEY])
  })
  it('אין כלום — patch ריק', () => {
    expect(migrateLegacyEditorPrefs(memStorage({}))).toEqual({})
  })
})
