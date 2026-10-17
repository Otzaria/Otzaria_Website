import { describe, expect, it } from 'vitest'
import { categories, faqs } from '@/lib/faq-data'
import { ALL_CATEGORY, categoryHeadingId, faqAnchorId, findFaqByHash, groupFaqs, splitLatinRuns } from './faqContent.js'

describe('groupFaqs', () => {
  it('"הכל": כל הקטגוריות לפי הסדר (בלי "הכל"), וכל שאלה מופיעה פעם אחת בסדר המקורי', () => {
    const groups = groupFaqs(faqs, categories, ALL_CATEGORY)
    expect(groups.map((g) => g.category.id)).toEqual(categories.filter((c) => c.id !== 'all').map((c) => c.id))
    const ids = groups.flatMap((g) => g.items.map((f) => f.id))
    expect(ids).toHaveLength(faqs.length)
    expect(new Set(ids).size).toBe(faqs.length)
    for (const group of groups) {
      expect(group.items.every((f) => f.category === group.category.id)).toBe(true)
    }
  })

  it('קטגוריה אחת: רק היא', () => {
    const groups = groupFaqs(faqs, categories, 'search')
    expect(groups).toHaveLength(1)
    expect(groups[0].category.id).toBe('search')
    expect(groups[0].items.map((f) => f.id)).toEqual(faqs.filter((f) => f.category === 'search').map((f) => f.id))
  })

  it('קטגוריה בלי שאלות לא מוחזרת', () => {
    const cats = [{ id: 'all', label: 'הכל' }, { id: 'a', label: 'א' }, { id: 'b', label: 'ב' }]
    const groups = groupFaqs([{ id: 1, category: 'b', question: 'ש', answer: 'ת' }], cats)
    expect(groups.map((g) => g.category.id)).toEqual(['b'])
  })
})

describe('עוגנים', () => {
  it('faqAnchorId / categoryHeadingId', () => {
    expect(faqAnchorId(7)).toBe('faq-7')
    expect(categoryHeadingId('usage')).toBe('faq-category-usage')
  })

  it('findFaqByHash: עם # ובלי, ורק שאלה קיימת', () => {
    expect(findFaqByHash('#faq-7', faqs)?.id).toBe(7)
    expect(findFaqByHash('faq-1', faqs)?.id).toBe(1)
    expect(findFaqByHash('#faq-999', faqs)).toBeNull()
    expect(findFaqByHash('#faq-category-usage', faqs)).toBeNull()
    expect(findFaqByHash('', faqs)).toBeNull()
    expect(findFaqByHash(undefined, faqs)).toBeNull()
  })

  it('לכל שאלה במקור id ייחודי', () => {
    expect(new Set(faqs.map((f) => f.id)).size).toBe(faqs.length)
  })
})

describe('splitLatinRuns', () => {
  const join = (parts) => parts.map((p) => p.text).join('')

  it('הטקסט המחובר זהה למקור — בכל שאלה ותשובה', () => {
    for (const faq of faqs) {
      expect(join(splitLatinRuns(faq.question))).toBe(faq.question)
      expect(join(splitLatinRuns(faq.answer))).toBe(faq.answer)
    }
  })

  it('מונח בסוגריים: רק המונח מבודד, הסוגריים וסימן השאלה נשארים בעברית', () => {
    expect(splitLatinRuns('האם יש גרסת אינטרנט (Web)?')).toEqual([
      { text: 'האם יש גרסת אינטרנט (', ltr: false },
      { text: 'Web', ltr: true },
      { text: ')?', ltr: false }
    ])
  })

  it('כמה מילים לועזיות ברצף — קטע אחד', () => {
    const ltr = (s) => splitLatinRuns(s).filter((p) => p.ltr).map((p) => p.text)
    expect(ltr('כיצד מורידים על iPhone / iPad?')).toEqual(['iPhone / iPad'])
    expect(ltr('שה-Visual C++ Redistributable מותקן')).toEqual(['Visual C++ Redistributable'])
    expect(ltr('הנדרשות:\nsudo apt-get install libgtk-3-0 libblkid1 liblzma5\nלאחר')).toEqual([
      'sudo apt-get install libgtk-3-0 libblkid1 liblzma5'
    ])
  })

  it('נקודה שמסיימת את המשפט לא נבלעת במונח', () => {
    expect(splitLatinRuns('להריץ את run-otzaria.sh.')).toEqual([
      { text: 'להריץ את ', ltr: false },
      { text: 'run-otzaria.sh', ltr: true },
      { text: '.', ltr: false }
    ])
  })

  it('מונחים מופרדים בפסיק — קטעים נפרדים', () => {
    expect(splitLatinRuns('TXT, DOCX ו-PDF').filter((p) => p.ltr).map((p) => p.text)).toEqual(['TXT', 'DOCX', 'PDF'])
  })

  it('טקסט עברי בלבד / ריק', () => {
    expect(splitLatinRuns('שלום')).toEqual([{ text: 'שלום', ltr: false }])
    expect(splitLatinRuns('')).toEqual([])
  })
})
