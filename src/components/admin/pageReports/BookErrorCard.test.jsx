// כרטיס "טעות בספר": מה מוצג להכרעה, שתי דרכי האישור ("השאר בסוגריים" / "החלף בתיקון" לפי canApply), הכפתורים לפי מצב, ומקלדת.
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookErrorCard from './BookErrorCard'
import { errorReport } from './testFixtures'

const renderCard = (report, props = {}) => {
  const onDecide = vi.fn()
  render(<ul><BookErrorCard report={report} busy={false} error={null} onDecide={onDecide} {...props} /></ul>)
  return onDecide
}

describe('כרטיס טעות בספר — תצוגה', () => {
  test('ספר, עמוד עם קישור לעורך, מדווח, מצב העמוד, הקשר, "בספר" מול "מוצע", צילום והערה', () => {
    renderCard(errorReport())
    const card = screen.getByRole('listitem')
    expect(within(card).getByRole('heading')).toHaveTextContent('בראשית רבה')
    expect(within(card).getByRole('heading')).toHaveTextContent('עמוד 12')
    expect(within(card).getByRole('link', { name: /פתח את עמוד 12 בבראשית רבה בעורך/ })).toHaveAttribute('href', '/library/books/bereshit-raba/12')
    expect(card).toHaveTextContent('משה כהן')
    expect(card).toHaveTextContent('מצב העמוד:')
    expect(card).toHaveTextContent('הושלם')
    // ההשוואה: "בספר" מול "התיקון המוצע", כל צד במשפט ההקשר שלו
    const del = card.querySelector('del')
    const ins = card.querySelector('ins')
    expect(del).toHaveTextContent('בספר: בראשת')
    expect(ins).toHaveTextContent('מוצע: בראשית')
    expect(card).toHaveTextContent('ויאמר')
    expect(card).toHaveTextContent('ברא אלהים')
    // האות שנוספה מודגשת בצד "מוצע"
    expect([...card.querySelectorAll('mark')].map((m) => m.textContent)).toContain('י')
    expect(card).toHaveTextContent('הערת המדווח: בדקתי בדפוס אחר')
    expect(within(card).getByRole('button', { name: /הגדל את צילום העמוד/ })).toBeInTheDocument()
  })

  test('יש אזור בצילום — מוצג מעל ההשוואה; אין — לא מוצג', () => {
    renderCard(errorReport({ cropRect: { x: 0.05, y: 0.3, w: 0.9, h: 0.06, source: 'layout', level: 'line' } }))
    const crop = screen.getByRole('button', { name: /הצג את צילום העמוד המלא — בראשית רבה, עמוד 12/ })
    const compare = screen.getByText('בספר', { selector: 'span' })
    expect(crop.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('בלי אזור בצילום — אין חיתוך', () => {
    renderCard(errorReport())
    expect(screen.queryByRole('button', { name: /הצג את צילום העמוד המלא/ })).toBeNull()
  })

  test('הצילום נפתח בהגדלה', async () => {
    const user = userEvent.setup()
    renderCard(errorReport())
    await user.click(screen.getByRole('button', { name: /הגדל את צילום העמוד/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img', { name: /צילום העמוד — בראשית רבה, עמוד 12/ })).toHaveAttribute('src', '/uploads/books/bereshit-raba/page-12.jpg')
  })

  test('בלי צילום — שורה שקטה', () => {
    renderCard(errorReport({ imageUrl: null }))
    expect(screen.getByText('אין צילום של העמוד')).toBeInTheDocument()
  })
})

describe('כרטיס טעות בספר — הכרעה', () => {





  test('עריכת הנוסח: תצוגה מקדימה לפי הנוסח החדש, והאישור שולח אותו', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    await user.click(screen.getByRole('button', { name: 'ערוך את הנוסח' }))
    const fix = screen.getByRole('textbox', { name: /^התיקון/ })
    expect(fix).toHaveValue('בראשית')
    await user.clear(fix)
    await user.type(fix, 'בראשיתא')
    const keep = screen.getByRole('button', { name: /^אשר את התיקון/ })
    await user.click(keep)
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve',
      { applyToText: false, note: '', edit: { original: 'בראשת', proposed: 'בראשיתא' } })
  })

  test('עריכת הנוסח: נוסח לא תקין — הודעה, והאישור מושבת; "בטל את העריכה" חוזר לנוסח המדווח', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    await user.click(screen.getByRole('button', { name: 'ערוך את הנוסח' }))
    const fix = screen.getByRole('textbox', { name: /^התיקון/ })
    await user.type(fix, ']')
    expect(screen.getByRole('alert')).toHaveTextContent('סוגריים מרובעים')
    const blockedKeep = screen.getByRole('button', { name: /^אשר את התיקון/ })
    expect(blockedKeep).toHaveAttribute('aria-disabled', 'true')
    await user.click(blockedKeep)
    expect(onDecide).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'בטל את העריכה' }))
    expect(screen.queryByRole('textbox', { name: /^התיקון/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^אשר את התיקון/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', { applyToText: false, note: '', edit: null })
  })




  test('הוחל — בלי "פתח מחדש" ובלי "החל"; כתוב מה נעשה', () => {
    renderCard(errorReport({ status: 'approved', appliedToText: 'proposed', canApply: false }))
    expect(screen.queryByRole('button', { name: /פתח מחדש/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /החל על הטקסט/ })).toBeNull()
    expect(screen.getByText('התיקון הוחל על טקסט העמוד')).toBeInTheDocument()
  })


  test('ההכרעה אינה משנה טקסט ופתיחת העמוד לעריכה ידנית זמינה', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    expect(screen.getByText(/ההכרעה נשמרת בדיווח בלבד ואינה משנה/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /עמוד 12/ })).toHaveAttribute('href', expect.stringContaining('/library/books/'))
    expect(screen.queryByRole('button', { name: /החלף בתיקון/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^אשר את התיקון/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', { applyToText: false, note: '', edit: null })
  })

  test('דיווח שהוכרע: הסבר לעריכה ידנית ופתיחה מחדש', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport({ status: 'approved' }))
    expect(screen.getByText(/ההכרעה לא שינתה את טקסט העמוד/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /החל על הטקסט/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /פתח מחדש/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'reopen')
  })

  test('בזמן בקשה — הכפתורים לא שולחים שוב', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport(), { busy: true })
    await user.click(screen.getByRole('button', { name: /^אשר את התיקון/ }))
    expect(onDecide).not.toHaveBeenCalled()
  })
})

describe('כרטיס טעות בספר — מקלדת', () => {
  test('A מאשר ו-R דוחה כשהפוקוס בכרטיס; בשדה ההערה — לא', () => {
    const onDecide = renderCard(errorReport())
    const card = screen.getByRole('listitem')
    fireEvent.keyDown(card, { key: 'a', code: 'KeyA' })
    expect(onDecide).toHaveBeenLastCalledWith(expect.anything(), 'approve', { applyToText: false, note: '', edit: null })
    fireEvent.keyDown(card, { key: 'r', code: 'KeyR' })
    expect(onDecide).toHaveBeenLastCalledWith(expect.anything(), 'reject', { applyToText: false, note: '', edit: null })
    onDecide.mockClear()
    fireEvent.keyDown(screen.getByRole('textbox', { name: /הערה למדווח/ }), { key: 'a', code: 'KeyA' })
    expect(onDecide).not.toHaveBeenCalled()
  })

  test('דיווח שהוכרע — A לא עושה כלום', () => {
    const onDecide = renderCard(errorReport({ status: 'approved' }))
    fireEvent.keyDown(screen.getByRole('listitem'), { key: 'a', code: 'KeyA' })
    expect(onDecide).not.toHaveBeenCalled()
  })
})

describe('כרטיס טעות בספר — פוקוס אחרי הכרעה', () => {
  test('הכרטיס נשאר ברשימה והכפתור שבפוקוס נעלם — הפוקוס עובר לכרטיס, לא לגוף הדף', async () => {
    const user = userEvent.setup()
    const onDecide = vi.fn()
    const { rerender } = render(<ul><BookErrorCard report={errorReport()} busy={false} error={null} onDecide={onDecide} /></ul>)
    await user.click(screen.getByRole('button', { name: /^אשר את התיקון/ }))
    rerender(<ul><BookErrorCard report={errorReport({ status: 'approved' })} busy={false} error={null} onDecide={onDecide} /></ul>)
    expect(screen.getByRole('listitem')).toHaveFocus()
  })
})
