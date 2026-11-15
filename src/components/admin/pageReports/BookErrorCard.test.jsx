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
  test('שתי דרכי אישור מפורשות, כל אחת עם התוצאה בטקסט; "השאר בסוגריים" שולח בלי החלה', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    expect(screen.getByRole('region', { name: 'אם התיקון נכון — מה ייכתב בטקסט העמוד?' })).toBeInTheDocument()
    const keep = screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ })
    const replace = screen.getByRole('button', { name: /^אשר והחלף בתיקון/ })
    expect(keep).toHaveAccessibleDescription(/ויאמר \(בראשת\)\[בראשית\] ברא אלהים/)
    expect(keep).toHaveAccessibleDescription(/המוסכמה המקובלת/)
    expect(replace).toHaveAccessibleDescription(/ויאמר בראשית ברא אלהים/)
    // פעיל — כפתור מלא (filled), לא מראה חיוור שנראה מושבת
    expect(replace).toBeEnabled()
    expect(replace).not.toHaveAttribute('aria-disabled')
    expect(replace).toHaveAttribute('data-state', 'enabled')
    expect(replace.className).toContain('--button-filled-bg')
    expect(keep.className).toContain('--button-filled-bg')
    expect(screen.queryByRole('checkbox')).toBeNull()
    await user.click(keep)
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ _id: 'r1' }), 'approve', { applyToText: false, note: '', edit: null })
  })

  test('"אשר והחלף בתיקון" שולח עם החלה', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    await user.click(screen.getByRole('button', { name: /^אשר והחלף בתיקון/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', { applyToText: true, note: '', edit: null })
  })

  test('דחייה עם הערה — בלי החלה, עם הסבר שהסימון נשאר', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    await user.type(screen.getByRole('textbox', { name: /הערה למדווח/ }), 'במקור כך')
    const reject = screen.getByRole('button', { name: /דחה את התיקון/ })
    expect(reject).toHaveAccessibleDescription(/הסימון נשאר בטקסט/)
    await user.click(reject)
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'reject', { applyToText: false, note: 'במקור כך', edit: null })
  })

  test('העמוד בעריכה — "החלף בתיקון" מושבת עם הסבר, ו"השאר בסוגריים" פעיל', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport({ pageStatus: 'in-progress', canApply: false }))
    const replace = screen.getByRole('button', { name: /^אשר והחלף בתיקון/ })
    // חסום — מראה אחר (מתאר + מנעול, לא filled), נשאר בסדר הטאב (aria-disabled), הסיבה מוקראת ובטולטיפ, והלחיצה לא שולחת
    expect(replace).toHaveAttribute('aria-disabled', 'true')
    expect(replace).toHaveAttribute('data-state', 'blocked')
    expect(replace.className).not.toContain('--button-filled-bg')
    expect(replace.className).toContain('--button-outlined-border')
    expect(replace.parentElement).toHaveClass('cursor-not-allowed')
    expect(replace.parentElement).toHaveAttribute('title', expect.stringMatching(/העמוד בעריכה עכשיו/))
    expect(replace).toHaveAccessibleDescription(/העמוד בעריכה עכשיו/)
    fireEvent.click(replace)
    expect(onDecide).not.toHaveBeenCalled()
    expect(screen.getByText('בטיפול')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', { applyToText: false, note: '', edit: null })
  })

  test('הסימון כבר לא בטקסט — "החלף בתיקון" מושבת עם הסבר', () => {
    renderCard(errorReport({ markerPresent: false, canApply: false }))
    expect(screen.getByRole('button', { name: /^אשר והחלף בתיקון/ })).toHaveAccessibleDescription(/הסימון כבר לא נמצא בטקסט/)
  })

  test('עריכת הנוסח: תצוגה מקדימה לפי הנוסח החדש, והאישור שולח אותו', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport())
    await user.click(screen.getByRole('button', { name: 'ערוך את הנוסח' }))
    const fix = screen.getByRole('textbox', { name: /^התיקון/ })
    expect(fix).toHaveValue('בראשית')
    await user.clear(fix)
    await user.type(fix, 'בראשיתא')
    const keep = screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ })
    expect(keep).toHaveAccessibleDescription(/\(בראשת\)\[בראשיתא\]/)
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
    const blockedKeep = screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ })
    expect(blockedKeep).toHaveAttribute('aria-disabled', 'true')
    await user.click(blockedKeep)
    expect(onDecide).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'בטל את העריכה' }))
    expect(screen.queryByRole('textbox', { name: /^התיקון/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ }))
    expect(onDecide).toHaveBeenCalledWith(expect.anything(), 'approve', { applyToText: false, note: '', edit: null })
  })

  test('הוכרע בנוסח המנהל: "הוצע · הוחלט", והסימון בנוסח הקודם — "עדכן את הסימון בטקסט"', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport({
      status: 'approved', finalOriginal: 'בראשת', finalProposed: 'בראשיתא', finalByName: 'המנהל', markerStale: true,
    }))
    expect(screen.getByText('הוצע:').parentElement).toHaveTextContent('(בראשת)[בראשית]')
    expect(screen.getByText('הוחלט:').parentElement).toHaveTextContent('(בראשת)[בראשיתא]')
    expect(screen.getByText('הסימון בטקסט עדיין בנוסח של המדווח.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /עדכן את הסימון בטקסט/ }))
    expect(onDecide).toHaveBeenLastCalledWith(expect.anything(), 'apply', { applyMode: 'marker' })
  })

  test('הוכרע ולא הוחל, ואפשר להחיל — "החל על הטקסט" ו"פתח מחדש"', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport({ status: 'approved', resolution: { note: 'נכון', byName: 'המנהל', at: '2026-11-12T10:00:00Z' } }))
    expect(screen.queryByRole('button', { name: /אשר והשאר/ })).toBeNull()
    expect(screen.getByText('הסימון נשאר בטקסט העמוד.')).toBeInTheDocument()
    expect(screen.getByText(/הערת מנהל:/).parentElement).toHaveTextContent('נכון')
    await user.click(screen.getByRole('button', { name: /החל על הטקסט/ }))
    expect(onDecide).toHaveBeenLastCalledWith(expect.anything(), 'apply')
    await user.click(screen.getByRole('button', { name: /פתח מחדש/ }))
    expect(onDecide).toHaveBeenLastCalledWith(expect.anything(), 'reopen')
  })

  test('הוכרע, העמוד בעריכה — בלי "החל על הטקסט", עם הסבר; "פתח מחדש" נשאר', () => {
    renderCard(errorReport({ status: 'rejected', pageStatus: 'in-progress', canApply: false }))
    expect(screen.queryByRole('button', { name: /החל על הטקסט/ })).toBeNull()
    expect(screen.getByText(/העמוד בעריכה עכשיו/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /פתח מחדש/ })).toBeInTheDocument()
  })

  test('הוחל — בלי "פתח מחדש" ובלי "החל"; כתוב מה נעשה', () => {
    renderCard(errorReport({ status: 'approved', appliedToText: 'proposed', canApply: false }))
    expect(screen.queryByRole('button', { name: /פתח מחדש/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /החל על הטקסט/ })).toBeNull()
    expect(screen.getByText('התיקון הוחל על טקסט העמוד')).toBeInTheDocument()
  })

  test('הודעת "לא נמצא" ושגיאה מהשרת', () => {
    renderCard(errorReport({ status: 'approved' }), { notice: 'not_found', error: { text: 'הטקסט השתנה בינתיים, נסו שוב' } })
    expect(screen.getByText(/הסימון לא נמצא בטקסט העמוד/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('הטקסט השתנה בינתיים, נסו שוב')
  })

  test('בזמן בקשה — הכפתורים לא שולחים שוב', async () => {
    const user = userEvent.setup()
    const onDecide = renderCard(errorReport(), { busy: true })
    await user.click(screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ }))
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
    await user.click(screen.getByRole('button', { name: /^אשר והשאר בסוגריים/ }))
    rerender(<ul><BookErrorCard report={errorReport({ status: 'approved' })} busy={false} error={null} onDecide={onDecide} /></ul>)
    expect(screen.getByRole('listitem')).toHaveFocus()
  })
})
