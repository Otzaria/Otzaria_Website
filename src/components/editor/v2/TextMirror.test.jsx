import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import TextMirror, { MIRROR_HIGHLIGHT, mirrorChunkSize, placeRowBand } from './TextMirror'
import TextEditor from '../TextEditor'

const TEXT = 'בראשית ברא אלהים\nאת השמים ואת\nשלםום הארץ'

const baseEditor = {
  content: TEXT, leftColumn: '', rightColumn: '', twoColumns: false, rightColumnName: 'א', leftColumnName: 'ב',
  handleAutoSave: () => {}, handleColumnChange: () => {}, setActiveTextarea: () => {}, selectedFont: 'Arial',
  columnWidth: 50, onColumnResizeStart: () => {}, textAlign: 'right', setTextAlign: () => {}, textZoom: 18, setTextZoom: () => {}
}

describe('TextMirror', () => {
  it('שורה לכל שורת טקסט, טקסט שקוף, השורה והמילה הנוכחיות מסומנות', () => {
    const { container } = render(<TextMirror text={TEXT} textarea={null} currentLine={1} currentWord={1} />)
    const m = container.querySelector('[data-text-mirror="content"]')
    expect(m).toHaveAttribute('aria-hidden', 'true')
    expect(m.style.color).toBe('transparent')
    expect(m.style.whiteSpace).toBe('pre-wrap')
    const lines = m.querySelectorAll('[data-line]')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toHaveAttribute('data-current')
    expect(lines[0]).not.toHaveAttribute('data-current')
    const cur = m.querySelector('[data-word][data-current]')
    expect(cur).toHaveTextContent('השמים')
    expect(cur.style.textDecorationStyle).toBe('solid')
    // הטקסט זהה לחלוטין (כולל רווחים) — אחרת הקווים זזים
    expect(lines[1].textContent).toBe('את השמים ואת')
  })

  it('רק המילה המסומנת עטופה ב-span; שאר השורה מחרוזת אחת (אחרת השבירה בגוש ארוך סוטה מה-textarea)', () => {
    const long = Array.from({ length: 100 }, (_, i) => `מילה${i}`).join(' ')
    const { container } = render(<TextMirror text={long} textarea={null} currentLine={0} currentWord={50} />)
    const line = container.querySelector('[data-line="0"]')
    expect(line.querySelectorAll('[data-word]')).toHaveLength(1)
    expect(line.querySelector('[data-word]')).toHaveTextContent('מילה50')
    // המקטעים הממוזכרים מחלקים את השורה לכמה צמתי טקסט צמודים — זה לא משנה את המדידה; מה שאסור הוא
    // רכיב עוטף נוסף מלבד המילה המסומנת
    expect(line.children).toHaveLength(1)
    expect(line.textContent).toBe(long)
  })

  it('מיקום משוער — אותו קו רציף ורקע חלש יותר; מילה חשודה — קו מנוקד; מספרי שורות', () => {
    const { container } = render(<TextMirror text={TEXT} textarea={null} currentLine={0} currentWord={0} estimated showSuspects lineNumbers />)
    const est = container.querySelector('[data-current][data-word]')
    expect(est.style.textDecorationStyle).toBe('solid')
    expect(est.style.background).toContain('50%')
    const sus = container.querySelectorAll('[data-suspect]')
    expect(sus).toHaveLength(1)
    expect(sus[0]).toHaveTextContent('שלםום')
    const nums = [...container.querySelectorAll('[data-line-number]')].map((n) => n.textContent)
    expect(nums).toEqual(['1', '2', '3'])
  })

  it('wrap="off" → white-space: pre; שורה ריקה מקבלת תו רוחב-אפס (גובה שורה)', () => {
    const { container } = render(<TextMirror text={'א\n\nב'} textarea={null} wrap="off" />)
    expect(container.firstChild.style.whiteSpace).toBe('pre')
    expect(container.querySelectorAll('[data-line]')[1].textContent).toBe('​')
  })

  it('עוצמה "חזק" (ברירת מחדל): רקע מעוגל למילה וקו עבה, בלי ריפוד (הטקסט לא זז); "רגיל" — רק קו', () => {
    const { container, rerender } = render(<TextMirror text={TEXT} textarea={null} currentLine={1} currentWord={1} />)
    let cur = container.querySelector('[data-word][data-current]')
    expect(cur.style.background).toContain('--color-glow')
    expect(cur.style.borderRadius).toBe('6px')
    expect(cur.style.background).toContain('70%')
    expect(cur.style.boxShadow).toContain('--color-primary')
    expect(cur.style.padding).toBe('')
    expect(cur.style.textDecorationThickness).toBe('3px')
    expect(container.querySelector('[data-line][data-current]').style.background).toContain('32%')
    rerender(<TextMirror text={TEXT} textarea={null} currentLine={1} currentWord={1} strength="normal" />)
    cur = container.querySelector('[data-word][data-current]')
    expect(cur.style.background).toBe('')
    expect(cur.style.textDecorationThickness).toBe('2.5px')
    expect(container.querySelector('[data-line][data-current]').style.background).toContain('24%')
  })

  it('גלישה: אותו white-space/overflow-wrap/word-break כמו textarea, ופס לשורת המסך של המילה', () => {
    const { container } = render(<TextMirror text={TEXT} textarea={null} currentLine={1} currentWord={1} />)
    const m = container.firstChild
    expect(m.style.overflowWrap).toBe('break-word')
    expect(m.style.wordBreak).toBe('normal')
    expect(m.style.scrollbarGutter).toBe('stable')
    expect(m.querySelector('[data-row-band]')).toBeInTheDocument()
  })

  it('placeRowBand: שורה לוגית שגולשת לכמה שורות מסך → פס בגובה שורה אחת סביב המילה, השורה כולה עדינה', () => {
    const m = document.createElement('div')
    m.style.lineHeight = '20px'
    m.innerHTML = '<div data-row-band></div><div data-line="0" data-current><span data-word="5" data-current>x</span></div>'
    document.body.appendChild(m)
    const band = m.querySelector('[data-row-band]')
    const line = m.querySelector('[data-line]')
    m.getBoundingClientRect = () => ({ top: 100, left: 0, width: 300, height: 400 })
    line.getBoundingClientRect = () => ({ top: 110, height: 80 })
    m.querySelector('[data-word]').getClientRects = () => [{ top: 152, bottom: 168 }]
    placeRowBand(m, band, 'strong')
    expect(band.style.display).toBe('block')
    expect(band.style.top).toBe('50px')
    expect(band.style.height).toBe('20px')
    expect(line.style.background).toContain('10%')
    // שורה אחת בלבד → בלי פס נפרד, הרקע הרגיל של השורה
    line.getBoundingClientRect = () => ({ top: 110, height: 20 })
    placeRowBand(m, band, 'strong')
    expect(band.style.display).toBe('none')
    expect(line.style.background).toBe(MIRROR_HIGHLIGHT.strong.band)
    m.remove()
  })

  it('גלילת ה-textarea מסונכרנת לשכבה', () => {
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    const { container } = render(<TextMirror text={TEXT} textarea={ta} />)
    ta.scrollTop = 40
    fireEvent.scroll(ta)
    expect(container.firstChild.scrollTop).toBe(40)
    ta.remove()
  })
})

describe('TextEditor + mirror', () => {
  it('בלי mirror — אין שכבה, ה-textarea כמו קודם (רקע, בלי wrap)', () => {
    const { container } = render(<TextEditor {...baseEditor} />)
    expect(container.querySelector('[data-text-mirror]')).toBeNull()
    const ta = container.querySelector('textarea')
    expect(ta.className).toContain('--editor-text-bg')
    expect(ta).not.toHaveAttribute('wrap')
    expect(ta.parentElement).toBe(container.firstChild)
  })

  it('עם mirror — שכבה מאחורי ה-textarea, באותו גופן; wrap="off" עובר לשניהם', () => {
    const { container } = render(<TextEditor {...baseEditor} mirror={{ column: 'content', line: 2, word: 0, lineNumbers: true }} wrap="off" />)
    const m = container.querySelector('[data-text-mirror="content"]')
    const ta = container.querySelector('textarea')
    expect(m.parentElement).toBe(ta.parentElement)
    expect(ta.className).toContain('bg-transparent')
    expect(ta).toHaveAttribute('wrap', 'off')
    expect(m.style.whiteSpace).toBe('pre')
    expect(m.style.fontFamily).toBe(ta.style.fontFamily)
    expect(m.style.fontSize).toBe('18px')
    expect(m.style.paddingInlineStart).toBe(ta.style.paddingInlineStart)
    expect(m.querySelectorAll('[data-line]')[2]).toHaveAttribute('data-current')
  })

  it('שני טורים — שכבה לכל טור, הסימון רק בטור הפעיל', () => {
    const { container } = render(
      <TextEditor {...baseEditor} twoColumns rightColumn={'א ב\nג'} leftColumn={'ד ה\nו'} mirror={{ column: 'left', line: 1, word: 0 }} />
    )
    const right = container.querySelector('[data-text-mirror="right"]')
    const left = container.querySelector('[data-text-mirror="left"]')
    expect(right.querySelector('[data-current]')).toBeNull()
    expect(left.querySelectorAll('[data-line]')[1]).toHaveAttribute('data-current')
    expect(container.querySelector('textarea[data-column="left"]').parentElement).toBe(left.parentElement)
  })
})

describe('mirrorChunkSize', () => {
  it('≈√(n/2), בין 8 ל-40', () => {
    expect(mirrorChunkSize(0)).toBe(8)
    expect(mirrorChunkSize(50)).toBe(8)
    expect(mirrorChunkSize(1152)).toBe(24)
    expect(mirrorChunkSize(100000)).toBe(40)
  })
})
