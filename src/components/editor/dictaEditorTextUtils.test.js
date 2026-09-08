import { describe, it, expect } from 'vitest'
import {
  buildTocFromContent,
  locateTextFlexible,
  normalizeHebrewQuotes,
  buildWordVariants,
  applyFindPatternTokens
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
