import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { validateOp } from '@/lib/pageProof/ops'
import ProofToolbar, { PARA_STYLE_OPTIONS, PROOF_FONT_SIZE, clampFontSize } from './ProofToolbar'

const STREAMS = [
  { key: 'main', he: 'ראשי', color: '#1a56db' },
  { key: 'notes', he: 'הערות', color: '#0e7f3c' },
  { key: 'header', he: 'כותרת עמוד', color: '#9ca3af' },
]

function setup(props = {}) {
  const handlers = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onParaStyle: vi.fn(),
    onCharStyle: vi.fn(),
    onSplitPara: vi.fn(),
    onJoinPara: vi.fn(),
    onLink: vi.fn(),
    onSuggest: vi.fn(),
    onNextSuspicious: vi.fn(),
    onStreamForLines: vi.fn(),
    setFontSize: vi.fn(),
    setFontFamily: vi.fn(),
    onHelp: vi.fn(),
    onToggleDetails: vi.fn(),
  }
  const all = { canUndo: true, canRedo: false, paraStyle: 'body', charStyles: new Set(), streams: STREAMS, fontSize: 20, ...handlers, ...props }
  render(<ProofToolbar {...all} />)
  return all
}

describe('ProofToolbar — סרגל-הכלים', () => {
  it('כפתור ההדגשה קורא ל-onCharStyle("b", true) כשההדגשה אינה פעילה', async () => {
    const p = setup()
    const bold = screen.getByRole('button', { name: 'מודגש' })
    expect(bold).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(bold)
    expect(p.onCharStyle).toHaveBeenCalledWith('b', true)
  })

  it('עיצוב פעיל מוצג לחוץ, ולחיצה עליו מסירה אותו', async () => {
    const p = setup({ charStyles: new Set(['b', 'sup']) })
    expect(screen.getByRole('button', { name: 'מודגש' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'מודגש' }))
    expect(p.onCharStyle).toHaveBeenLastCalledWith('b', false)
    await userEvent.click(screen.getByRole('button', { name: 'נטוי' }))
    expect(p.onCharStyle).toHaveBeenLastCalledWith('i', true)
    await userEvent.click(screen.getByRole('button', { name: 'כתב עילי — אות קטנה מורמת' }))
    expect(p.onCharStyle).toHaveBeenLastCalledWith('sup', false)
  })

  it('מודגש לחוץ גם על הדגשה מגלאי-הטיפוגרפיה (heavy), ולחיצה מסירה אותה', async () => {
    const p = setup({ charStyles: new Set(['heavy']) })
    const bold = screen.getByRole('button', { name: 'מודגש' })
    expect(bold).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(bold)
    expect(p.onCharStyle).toHaveBeenLastCalledWith('b', false)
  })

  it('לועזית (latin) — כפתור-מתג כמו שאר עיצובי-התו', async () => {
    const p = setup({ charStyles: new Set(['latin']) })
    const latin = screen.getByRole('button', { name: 'לועזית — מילים באנגלית (משמאל לימין)' })
    expect(latin).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(latin)
    expect(p.onCharStyle).toHaveBeenLastCalledWith('latin', false)
  })

  it('כפתורי העיצוב אינם לוקחים את הפוקוס מהעורך (mousedown מבוטל)', () => {
    setup()
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'מודגש' }))).toBe(false)
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'פסקה חדשה' }))).toBe(false)
  })

  it('בלי פעולה — הכפתור מושבת; readOnly משבית עריכה אך לא עזרה ופרטים', () => {
    setup({ onCharStyle: undefined, onSplitPara: null })
    expect(screen.getByRole('button', { name: 'מודגש' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'פסקה חדשה' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'חיבור פסקאות' })).toBeEnabled()
  })

  it('תצוגה בלבד: כלי-העריכה מושבתים, ניווט/תצוגה/עזרה פעילים', () => {
    setup({ readOnly: true })
    for (const name of ['ביטול', 'מודגש', 'פסקה חדשה', 'חיבור פסקאות', 'קישור', 'סגנון הפסקה', 'זרם לשורות']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    for (const name of ['עזרה', 'פרטים', 'המילה החשודה הבאה', 'הצעות למילה', 'הגדלת הטקסט']) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }
  })

  it('ביטול/חזרה לפי canUndo/canRedo', async () => {
    const p = setup({ canUndo: true, canRedo: false })
    expect(screen.getByRole('button', { name: 'חזרה' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(p.onUndo).toHaveBeenCalledTimes(1)
  })

  it('תפריט סגנון-הפסקה: מציג את הנוכחי ומחיל את הנבחר', async () => {
    const p = setup({ paraStyle: 'h1' })
    const trigger = screen.getByRole('button', { name: 'סגנון הפסקה' })
    expect(trigger).toHaveTextContent('כותרת ראשית')
    await userEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitemradio')
    const names = [
      'טקסט רגיל',
      'כותרת ראשית',
      'כותרת פרק',
      'כותרת משנה',
      'ציטוט',
      'דיבור המתחיל',
      'סעיף ממוספר',
      'הגהה',
      'שורות קצרות (שירה)',
      'שורת תוכן עניינים',
    ]
    expect(items).toHaveLength(names.length)
    items.forEach((item, k) => expect(item).toHaveAccessibleName(names[k]))
    // שלוש קבוצות: טקסט רגיל · כותרות · סוגי-פסקה — ואחריהן הפעולות על הפסקה
    expect(within(menu).getAllByRole('separator')).toHaveLength(3)
    expect(within(menu).getByRole('menuitemradio', { name: /כותרת ראשית/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /כותרת פרק/ }))
    expect(p.onParaStyle).toHaveBeenCalledWith('h2')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('paraStyleOptions (דף עוטף): הרשימה שלו בתפריט — קווים רק בין קבוצות, והנוכחי מסומן', async () => {
    const paraStyleOptions = [
      { separator: true },
      { key: 'body', he: 'טקסט רגיל' },
      { key: 'h1', he: 'כותרת ראשית' },
      { separator: true },
      { separator: true },
      { key: 'note', he: 'הערה', hint: 'פסקת הערה' },
    ]
    const p = setup({ paraStyle: 'note', paraStyleOptions })
    const trigger = screen.getByRole('button', { name: 'סגנון הפסקה' })
    expect(trigger).toHaveTextContent('הערה')
    await userEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitemradio')
    const names = ['טקסט רגיל', 'כותרת ראשית', 'הערה']
    expect(items).toHaveLength(names.length)
    names.forEach((n, k) => expect(items[k]).toHaveAccessibleName(n))
    // body · (קו לפני h1) h1 · (קו אחד) note · (קו) הפעולות
    expect(within(menu).getAllByRole('separator')).toHaveLength(3)
    expect(within(menu).getByRole('menuitemradio', { name: 'הערה' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'כותרת ראשית' }))
    expect(p.onParaStyle).toHaveBeenCalledWith('h1')
  })

  it('בסוף תפריט סגנון-הפסקה: "פסקה חדשה" ו"חיבור לפסקה הקודמת" — פעולות (לא בחירה), בשם מלא', async () => {
    const p = setup({ paraStyle: 'body' })
    await userEvent.click(screen.getByRole('button', { name: 'סגנון הפסקה' }))
    const menu = screen.getByRole('menu')
    const join = within(menu).getByRole('menuitem', { name: /חיבור לפסקה הקודמת/ })
    expect(join).not.toHaveAttribute('aria-checked')
    expect(join).toHaveTextContent('Backspace בתחילתה')
    await userEvent.click(join)
    expect(p.onJoinPara).toHaveBeenCalledTimes(1)
    expect(p.onParaStyle).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'סגנון הפסקה' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /פסקה חדשה במקום הסמן/ }))
    expect(p.onSplitPara).toHaveBeenCalledTimes(1)
  })

  it('בלי חיבור אפשרי (הפסקה הראשונה) — הפריט מושבת', async () => {
    const p = setup({ paraStyle: 'body', onJoinPara: null })
    await userEvent.click(screen.getByRole('button', { name: 'סגנון הפסקה' }))
    const join = within(screen.getByRole('menu')).getByRole('menuitem', { name: /חיבור לפסקה הקודמת/ })
    expect(join).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(join)
    expect(p.onParaStyle).not.toHaveBeenCalled()
  })

  it('ארבעת סוגי-הפסקה החדשים: הסבר קצר בריחוף, תצוגה מקדימה, ובחירה מחילה אותם', async () => {
    const p = setup({ paraStyle: 'gloss' })
    const trigger = screen.getByRole('button', { name: 'סגנון הפסקה' })
    expect(trigger).toHaveTextContent('הגהה')
    await userEvent.click(trigger)
    const item = (name) => screen.getByRole('menuitemradio', { name })
    expect(item('הגהה')).toHaveAttribute('aria-checked', 'true')
    expect(item('סעיף ממוספר')).toHaveAttribute('title', expect.stringContaining('א גרסינן'))
    expect(item('הגהה')).toHaveAttribute('title', expect.stringContaining('בכוכבית או בסוגריים'))
    expect(item('שורות קצרות (שירה)')).toHaveAttribute('title', expect.stringContaining('שורות קצרות'))
    expect(item('שורת תוכן עניינים')).toHaveAttribute('title', expect.stringContaining('תוכן העניינים'))
    // התצוגה המקדימה: "א." לפני הסעיף, * לפני ההגהה, קו-נקודות ומספר-עמוד בתוכן-העניינים
    // (מוסתרים מקוראי-מסך), ושתי שורות קצרות בשירה
    expect(item('סעיף ממוספר')).toHaveTextContent('א.סעיף ממוספר')
    expect(item('הגהה')).toHaveTextContent('*הגהה')
    expect(item('שורת תוכן עניינים').querySelector('.border-dotted')).toBeInTheDocument()
    expect(item('שורות קצרות (שירה)').querySelector('.flex-col')?.children).toHaveLength(2)
    for (const [name, key] of [
      ['סעיף ממוספר', 'list'],
      ['הגהה', 'gloss'],
      ['שורות קצרות (שירה)', 'poem'],
      ['שורת תוכן עניינים', 'toc'],
    ]) {
      if (!screen.queryByRole('menu')) await userEvent.click(trigger)
      await userEvent.click(item(name))
      expect(p.onParaStyle).toHaveBeenLastCalledWith(key)
    }
  })

  it('כל סגנונות-הפסקה שבסרגל מוכרים בחוזה (פעולת para תקינה)', () => {
    const doc = { page: 1, size: [100, 100], lines: [{ id: 1, text: 'א', bbox: [1, 1, 50, 20] }] }
    for (const o of PARA_STYLE_OPTIONS) expect(validateOp(doc, { kind: 'para', page: 1, ids: [1], value: o.key })).toBeNull()
  })

  it('סגנון שאינו בתפריט מוצג בשמו (למשל "הערה")', () => {
    setup({ paraStyle: 'note' })
    expect(screen.getByRole('button', { name: 'סגנון הפסקה' })).toHaveTextContent('הערה')
  })

  it('תפריט במקלדת: ↓ פותח על הנוכחי, ↓ מתקדם, Enter בוחר, Esc סוגר ומחזיר פוקוס', async () => {
    const user = userEvent.setup()
    const p = setup({ paraStyle: 'h1' })
    const trigger = screen.getByRole('button', { name: 'סגנון הפסקה' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: /כותרת ראשית/ })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: /כותרת פרק/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(p.onParaStyle).toHaveBeenCalledWith('h2')
    expect(trigger).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('זרם לשורות: זרמי-התוכן, ואחרי קו — "ריהוט הדף" (כותרת עמוד, תחתית, מפריד), "לא נכנס לספר"', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'זרם לשורות' }))
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual([
      'ראשי',
      'הערות',
      'ריהוט הדף · כותרת עמוד כותרת-רצה · לא נכנס לספר',
      'ריהוט הדף · תחתית מספר עמוד · לא נכנס לספר',
      'ריהוט הדף · מפריד קו בלבד · לא נכנס לספר',
    ])
    expect(items[2]).toHaveAccessibleName('ריהוט הדף · כותרת עמוד כותרת-רצה · לא נכנס לספר')
    // הקו בין התוכן לריהוט
    expect(within(menu).getByRole('separator')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /מפריד/ })).toHaveAttribute('title', expect.stringContaining('לא-שורה'))
    await userEvent.click(within(menu).getByRole('menuitem', { name: /^הערות/ }))
    expect(p.onStreamForLines).toHaveBeenCalledWith('notes')
    await userEvent.click(screen.getByRole('button', { name: 'זרם לשורות' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /ריהוט הדף · תחתית/ }))
    expect(p.onStreamForLines).toHaveBeenLastCalledWith('footer')
  })

  it('זרם לשורות: ריהוט הדף בתפריט גם כשהעמוד לא הביא אותו באוצר-המילים שלו', async () => {
    setup({ streams: [{ key: 'main', he: 'ראשי', color: '#1a56db' }] })
    await userEvent.click(screen.getByRole('button', { name: 'זרם לשורות' }))
    const names = within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent)
    expect(names).toHaveLength(4)
    expect(names.filter((n) => n.startsWith('ריהוט הדף'))).toHaveLength(3)
  })

  it('לחיצה מחוץ לתפריט סוגרת אותו', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'זרם לשורות' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('מילה חשודה הבאה/הקודמת, הצעות, קישור, עזרה ופרטים', async () => {
    const p = setup({ detailsOpen: true, linkPending: { from: { lineId: 1, words: [0, 0] } } })
    await userEvent.click(screen.getByRole('button', { name: 'המילה החשודה הבאה' }))
    expect(p.onNextSuspicious).toHaveBeenLastCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'המילה החשודה הקודמת' }))
    expect(p.onNextSuspicious).toHaveBeenLastCalledWith(-1)
    await userEvent.click(screen.getByRole('button', { name: 'הצעות למילה' }))
    expect(p.onSuggest).toHaveBeenCalled()
    const link = screen.getByRole('button', { name: 'השלמת הקישור' })
    expect(link).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(link)
    expect(p.onLink).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'עזרה' }))
    expect(p.onHelp).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'פרטים' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    expect(p.onToggleDetails).toHaveBeenCalled()
  })

  it('גודל הטקסט: בצעדים ובגבולות; גופן: select', async () => {
    const p = setup({ fontSize: 20 })
    await userEvent.click(screen.getByRole('button', { name: 'הגדלת הטקסט' }))
    expect(p.setFontSize).toHaveBeenLastCalledWith(22)
    await userEvent.click(screen.getByRole('button', { name: 'הקטנת הטקסט' }))
    expect(p.setFontSize).toHaveBeenLastCalledWith(18)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'גופן התצוגה' }), 'אריאל')
    expect(p.setFontFamily).toHaveBeenCalledWith('Arial, sans-serif')
    expect(clampFontSize(999)).toBe(PROOF_FONT_SIZE.max)
    expect(clampFontSize(Number.NaN)).toBe(PROOF_FONT_SIZE.default)
  })

  it('בגבול העליון — כפתור ההגדלה מושבת', () => {
    setup({ fontSize: PROOF_FONT_SIZE.max })
    expect(screen.getByRole('button', { name: 'הגדלת הטקסט' })).toBeDisabled()
  })

  it('כפתורי הדף העוטף (actions) בסרגל', () => {
    setup({ actions: <button type="button">הגשה</button> })
    expect(screen.getByRole('button', { name: 'הגשה' })).toBeInTheDocument()
  })

  // שלב "מבנה" בדף המתנדב (stages.stageFocus): רק מה שנוגע למבנה; בלי hide — הכול, כמו תמיד (גם בתוכנת-הספר)
  it('hide מסתיר קבוצות (והקו שאחרי כל אחת); השאר — כרגיל', () => {
    setup({ hide: ['paraStyle', 'charStyles', 'paragraphs', 'link', 'suspicious', 'bookOnly'], onBookOnly: vi.fn() })
    // "לספר בלבד" / "פגם בדפוס" (שם הכפתור משתנה בסבב אחר — כאן שניהם)
    for (const name of ['מודגש', 'פסקה חדשה', 'קישור', 'הצעות למילה', /^(לספר בלבד|פגם בדפוס)$/]) {
      expect(screen.queryByRole('button', { name }), String(name)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'סגנון הפסקה' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'זרם לשורות' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'עזרה' })).toBeInTheDocument()
    const visibleDividers = [...screen.getByRole('toolbar').querySelectorAll('div.w-px')].filter((d) => !d.hidden)
    expect(visibleDividers.length).toBeLessThan(5)
  })

  it('בלי hide — כל הקבוצות מוצגות', () => {
    setup({ onBookOnly: vi.fn() })
    for (const name of ['מודגש', 'פסקה חדשה', 'קישור', 'הצעות למילה', /^(לספר בלבד|פגם בדפוס)$/, 'סגנון הפסקה']) {
      expect(screen.getByRole('button', { name }), String(name)).toBeInTheDocument()
    }
  })
})

// "הנחיות" (2026-10-05) — כפתור בסרגל רק כשיש לאן (onGuide); ומצב "פגם בדפוס" מוסבר כמצב
describe('ProofToolbar — "הנחיות" ו"פגם בדפוס"', () => {
  it('"הנחיות" — בלי onGuide אין כפתור', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'הנחיות' })).toBeNull()
  })

  it('"הנחיות" עם onGuide — הלחיצה קוראת לו', async () => {
    const onGuide = vi.fn()
    setup({ onGuide })
    const b = screen.getByRole('button', { name: 'הנחיות' })
    expect(b).toHaveAttribute('title', expect.stringContaining('הנחיות להגהת עמודים'))
    await userEvent.click(b)
    expect(onGuide).toHaveBeenCalled()
  })

  it('"פגם בדפוס": השם בסרגל, וההסבר אומר שזה מצב', () => {
    setup({ onBookOnly: vi.fn() })
    const b = screen.getByRole('button', { name: 'פגם בדפוס' })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    expect(b).toHaveAttribute('title', expect.stringContaining('כשהמצב דולק, כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב'))
    expect(screen.queryByRole('button', { name: 'לספר בלבד' })).toBeNull()
  })
})
