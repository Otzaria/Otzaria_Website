import { describe, it, expect } from 'vitest'
import {
  buildTocFromContent,
  locateTextFlexible,
  normalizeHebrewQuotes,
  buildWordVariants,
  applyFindPatternTokens,
  computeInsertTagResult,
  computeRemoveTagsResult,
  computeFindNextMatch,
  computeReplaceCurrentResult,
  computeReplaceAllResult,
  computeSavedReplacementsResult
} from './dictaEditorTextUtils'

describe('buildTocFromContent', () => {
  it('returns an empty array for empty/falsy content', () => {
    expect(buildTocFromContent('')).toEqual([])
    expect(buildTocFromContent(null)).toEqual([])
    expect(buildTocFromContent(undefined)).toEqual([])
  })

  it('extracts headings with id, level, text, html and position', () => {
    const content = '<p>intro</p><h1>כותרת ראשית</h1><p>גוף</p><h2>תת כותרת</h2>'
    const toc = buildTocFromContent(content)
    expect(toc).toHaveLength(2)
    expect(toc[0]).toMatchObject({
      id: 'heading-0',
      level: 1,
      text: 'כותרת ראשית',
      html: '<h1>כותרת ראשית</h1>'
    })
    expect(toc[0].position).toBe(content.indexOf('<h1>'))
    expect(toc[1]).toMatchObject({ id: 'heading-1', level: 2, text: 'תת כותרת' })
  })

  it('strips inner tags and decodes entities in order (amp last, no double-decoding)', () => {
    const content = '<h1>א <b>ב</b>&nbsp;ג &amp;lt; ד &lt;תג&gt; ה &quot;צ&quot; ו &#39;ם&#39;</h1>'
    const toc = buildTocFromContent(content)
    expect(toc).toHaveLength(1)
    // &amp;lt; must remain literal "&lt;" text, NOT decode further to "<"
    expect(toc[0].text).toBe('א ב ג &lt; ד <תג> ה "צ" ו \'ם\'')
  })

  it('clamps heading level to the 1-6 range and matches h1..h6 case-insensitively', () => {
    const content = '<H3>Title</H3>'
    const toc = buildTocFromContent(content)
    expect(toc[0].level).toBe(3)
  })

  it('collapses whitespace runs in heading text', () => {
    const content = '<h1>א   ב\n\nג</h1>'
    const toc = buildTocFromContent(content)
    expect(toc[0].text).toBe('א ב ג')
  })
})

describe('locateTextFlexible', () => {
  it('returns null for empty phrase or content', () => {
    expect(locateTextFlexible('some content', '')).toBeNull()
    expect(locateTextFlexible('', 'phrase')).toBeNull()
    expect(locateTextFlexible('content', '   ')).toBeNull()
  })

  it('finds an exact match and returns start/end offsets', () => {
    const content = 'לפני הקטע המבוקש אחרי'
    const result = locateTextFlexible(content, 'הקטע המבוקש')
    expect(result).toEqual({
      start: content.indexOf('הקטע המבוקש'),
      end: content.indexOf('הקטע המבוקש') + 'הקטע המבוקש'.length
    })
  })

  it('normalizes internal whitespace in the search phrase before exact match', () => {
    const content = 'א ב ג'
    const result = locateTextFlexible(content, '  א   ב  ')
    expect(result).toEqual({ start: 0, end: 3 })
  })

  it('falls back to a tolerant match across HTML tags and &nbsp;', () => {
    const content = 'לפני <b>הקטע</b>&nbsp;המבוקש אחרי'
    const result = locateTextFlexible(content, 'הקטע המבוקש')
    expect(result).not.toBeNull()
    expect(content.slice(result.start, result.end)).toBe('הקטע</b>&nbsp;המבוקש')
  })

  it('tolerates ASCII vs Hebrew quote differences', () => {
    const content = 'לפני &quot;מצוטט&quot; אחרי'
    const result = locateTextFlexible(content, '"מצוטט"')
    expect(result).not.toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(locateTextFlexible('תוכן כלשהו', 'לא קיים בכלל')).toBeNull()
  })
})

describe('normalizeHebrewQuotes', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeHebrewQuotes('')).toBe('')
    expect(normalizeHebrewQuotes(null)).toBe('')
    expect(normalizeHebrewQuotes(undefined)).toBe('')
  })

  it('converts double quotes to gershayim and single quotes to geresh', () => {
    expect(normalizeHebrewQuotes(`ר"ת`)).toBe('ר״ת')
    expect(normalizeHebrewQuotes(`ר'ת`)).toBe('ר׳ת')
    expect(normalizeHebrewQuotes(`a"b'c`)).toBe('a״b׳c')
  })

  it('leaves text without quotes unchanged', () => {
    expect(normalizeHebrewQuotes('אבגד')).toBe('אבגד')
  })
})

describe('buildWordVariants', () => {
  it('returns an empty array for falsy input', () => {
    expect(buildWordVariants('')).toEqual([])
    expect(buildWordVariants(null)).toEqual([])
  })

  it('returns the original word for text without quotes (deduplicated)', () => {
    expect(buildWordVariants('שלום')).toEqual(['שלום'])
  })

  it('produces original, hebrew-quote, and ascii-quote variants without duplicates', () => {
    const variants = buildWordVariants(`ר"ת`)
    expect(variants).toEqual(['ר"ת', 'ר״ת'])
  })

  it('handles a word already containing hebrew quotes', () => {
    const variants = buildWordVariants('ר״ת')
    expect(variants).toEqual(['ר״ת', 'ר"ת'])
  })
})

describe('applyFindPatternTokens', () => {
  it('replaces the literal "^13" token with a real newline', () => {
    expect(applyFindPatternTokens('שורה1^13שורה2')).toBe('שורה1\nשורה2')
  })

  it('replaces multiple occurrences', () => {
    expect(applyFindPatternTokens('א^13ב^13ג')).toBe('א\nב\nג')
  })

  it('leaves strings without the token unchanged', () => {
    expect(applyFindPatternTokens('רגיל ללא שינוי')).toBe('רגיל ללא שינוי')
  })
})

describe('computeInsertTagResult', () => {
  it('wraps a plain selection with the given tag and places cursor after it', () => {
    const content = 'לפני מילה אחרי'
    const start = content.indexOf('מילה')
    const end = start + 'מילה'.length
    const { newText, newCursorPos } = computeInsertTagResult(content, start, end, 'b')
    expect(newText).toBe('לפני <b>מילה</b> אחרי')
    expect(newCursorPos).toBe(start + '<b>מילה</b>'.length)
  })

  it('inserts an empty tag pair at the cursor when nothing is selected', () => {
    const content = 'לפני  אחרי'
    const pos = 'לפני '.length
    const { newText, newCursorPos } = computeInsertTagResult(content, pos, pos, 'i')
    expect(newText).toBe('לפני <i></i> אחרי')
    expect(newCursorPos).toBe(pos + 'i'.length + 2)
  })

  it('trims leading/trailing whitespace out of the wrapped selection', () => {
    const content = 'א  מילה  ב'
    const start = content.indexOf('  מילה  ')
    const end = start + '  מילה  '.length
    const { newText } = computeInsertTagResult(content, start, end, 'u')
    expect(newText).toBe('א  <u>מילה</u>  ב')
  })

  it('strips existing HTML tags from the selection before wrapping in a heading tag', () => {
    const content = 'לפני <b>מילה</b> אחרי'
    const start = content.indexOf('<b>')
    const end = content.indexOf('</b>') + '</b>'.length
    const { newText } = computeInsertTagResult(content, start, end, 'h1')
    expect(newText).toBe('לפני <h1>מילה</h1>\n אחרי')
  })

  it('does not add a trailing newline after a heading when one already follows', () => {
    const content = 'כותרת\nגוף'
    const { newText } = computeInsertTagResult(content, 0, 'כותרת'.length, 'h2')
    expect(newText).toBe('<h2>כותרת</h2>\nגוף')
  })

  it('does not add a trailing newline after a heading at the end of the document', () => {
    const content = 'כותרת'
    const { newText } = computeInsertTagResult(content, 0, 'כותרת'.length, 'h2')
    expect(newText).toBe('<h2>כותרת</h2>')
  })
})

describe('computeRemoveTagsResult', () => {
  it('returns an error when nothing is selected', () => {
    const result = computeRemoveTagsResult('תוכן כלשהו', 3, 3)
    expect(result.error).toBe('יש לבחור טקסט להסרת תגים')
  })

  it('strips HTML tags from the selected text and keeps the rest of the document intact', () => {
    const content = 'לפני <b>מילה</b> אחרי'
    const start = content.indexOf('<b>')
    const end = content.indexOf('</b>') + '</b>'.length
    const result = computeRemoveTagsResult(content, start, end)
    expect(result.newText).toBe('לפני מילה אחרי')
    expect(result.newSelectionStart).toBe(start)
    expect(result.newSelectionEnd).toBe(start + 'מילה'.length)
  })

  it('leaves plain text (no tags) in the selection unchanged', () => {
    const content = 'טקסט רגיל בלבד'
    const result = computeRemoveTagsResult(content, 0, content.length)
    expect(result.newText).toBe(content)
    expect(result.newSelectionEnd).toBe(content.length)
  })
})

describe('computeFindNextMatch', () => {
  it('returns an error when the search text is empty', () => {
    expect(computeFindNextMatch('תוכן', '', false, 0)).toEqual({ error: 'הזן טקסט לחיפוש' })
  })

  it('finds a plain-text match after the given position', () => {
    const content = 'אבג מילה דהו מילה זי'
    const secondIndex = content.indexOf('מילה', content.indexOf('מילה') + 1)
    const result = computeFindNextMatch(content, 'מילה', false, 5)
    expect(result).toEqual({ matchIndex: secondIndex, matchLength: 'מילה'.length, wrapped: false })
  })

  it('wraps around to the start when no match is found after the position', () => {
    const content = 'מילה אבג דהו'
    const result = computeFindNextMatch(content, 'מילה', false, 5)
    expect(result).toEqual({ matchIndex: 0, matchLength: 'מילה'.length, wrapped: true })
  })

  it('returns matchIndex -1 when there is no match anywhere', () => {
    const result = computeFindNextMatch('תוכן כלשהו', 'לא קיים', false, 0)
    expect(result.matchIndex).toBe(-1)
  })

  it('supports regex mode and reports wrapped correctly', () => {
    const content = 'a1 b2 c3'
    const result = computeFindNextMatch(content, '[a-z]\\d', true, 3)
    expect(result).toEqual({ matchIndex: 3, matchLength: 2, wrapped: false })
  })

  it('returns an error for an invalid regex pattern', () => {
    const result = computeFindNextMatch('תוכן', '(', true, 0)
    expect(result.error).toBe('ביטוי רגולרי לא תקין')
  })

  it('translates the "^13" token into a real newline before searching', () => {
    const content = 'שורה1\nשורה2'
    const result = computeFindNextMatch(content, 'שורה1^13שורה2', false, 0)
    expect(result.matchIndex).toBe(0)
    expect(result.matchLength).toBe(content.length)
  })
})

describe('computeReplaceCurrentResult', () => {
  it('returns an error when the search text is empty', () => {
    expect(computeReplaceCurrentResult('תוכן', 0, 0, '', 'x', false)).toEqual({ error: 'הזן טקסט לחיפוש' })
  })

  it('reports noSelection when start === end, without touching content', () => {
    const result = computeReplaceCurrentResult('תוכן כלשהו', 3, 3, 'תוכן', 'אחר', false)
    expect(result).toEqual({ noSelection: true })
  })

  it('replaces the selected range with the replacement text', () => {
    const content = 'לפני מילה אחרי'
    const start = content.indexOf('מילה')
    const end = start + 'מילה'.length
    const result = computeReplaceCurrentResult(content, start, end, 'מילה', 'אחרת', false)
    expect(result.newText).toBe('לפני אחרת אחרי')
    expect(result.newCursorPos).toBe(start + 'אחרת'.length)
  })

  it('applies a regex replacement (with capture groups) to the selected text only', () => {
    const content = 'לפני 12345 אחרי'
    const start = content.indexOf('12345')
    const end = start + 5
    const result = computeReplaceCurrentResult(content, start, end, '(\\d)(\\d+)', '$2$1', true)
    expect(result.newText).toBe('לפני 23451 אחרי')
  })

  it('returns an error for an invalid regex pattern', () => {
    const result = computeReplaceCurrentResult('לפני X אחרי', 5, 6, '(', 'y', true)
    expect(result.error).toBe('ביטוי רגולרי לא תקין')
  })
})

describe('computeReplaceAllResult', () => {
  it('returns an error when the search text is empty', () => {
    expect(computeReplaceAllResult('תוכן', '', 'x', false)).toEqual({ error: 'הזן טקסט לחיפוש' })
  })

  it('replaces every plain-text occurrence and reports the count', () => {
    const content = 'א מילה ב מילה ג מילה'
    const result = computeReplaceAllResult(content, 'מילה', 'משהו', false)
    expect(result.newText).toBe('א משהו ב משהו ג משהו')
    expect(result.count).toBe(3)
  })

  it('treats plain-text special characters literally (not as regex)', () => {
    const content = 'מחיר: 5$ בלבד'
    const result = computeReplaceAllResult(content, '5$', '10$', false)
    expect(result.newText).toBe('מחיר: 10$ בלבד')
    expect(result.count).toBe(1)
  })

  it('returns count 0 and the original text unchanged when nothing matches', () => {
    const content = 'תוכן ללא התאמה'
    const result = computeReplaceAllResult(content, 'לא קיים', 'x', false)
    expect(result).toEqual({ newText: content, count: 0 })
  })

  it('supports full regex replacement with capture groups', () => {
    const content = 'a1 b2 c3'
    const result = computeReplaceAllResult(content, '([a-z])(\\d)', '$2$1', true)
    expect(result.newText).toBe('1a 2b 3c')
    expect(result.count).toBe(3)
  })

  it('returns an error for an invalid regex pattern', () => {
    const result = computeReplaceAllResult('תוכן', '(', 'x', true)
    expect(result.error).toBe('ביטוי רגולרי לא תקין')
  })
})

describe('computeSavedReplacementsResult', () => {
  it('applies multiple saved searches in order and sums up total replacements', () => {
    const content = 'א מילה1 ב מילה2 ג מילה1'
    const savedSearches = [
      { findText: 'מילה1', replaceText: 'X', isRegex: false },
      { findText: 'מילה2', replaceText: 'Y', isRegex: false }
    ]
    const result = computeSavedReplacementsResult(content, savedSearches)
    expect(result.newText).toBe('א X ב Y ג X')
    expect(result.totalReplacements).toBe(3)
  })

  it('handles the special isRemoveDigits saved search', () => {
    const content = 'עמוד 12 שורה 34'
    const savedSearches = [{ isRemoveDigits: true }]
    const result = computeSavedReplacementsResult(content, savedSearches)
    expect(result.newText).toBe('עמוד  שורה ')
  })

  it('skips a saved search with an invalid regex and continues with the rest', () => {
    const content = 'א מילה ב'
    const savedSearches = [
      { findText: '(', replaceText: 'x', isRegex: true },
      { findText: 'מילה', replaceText: 'אחרת', isRegex: false }
    ]
    const result = computeSavedReplacementsResult(content, savedSearches)
    expect(result.newText).toBe('א אחרת ב')
    expect(result.totalReplacements).toBe(1)
  })

  it('returns the original content unchanged with zero replacements for an empty list', () => {
    const result = computeSavedReplacementsResult('תוכן קבוע', [])
    expect(result).toEqual({ newText: 'תוכן קבוע', totalReplacements: 0 })
  })
})
