import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProofHelp, { HELP_SEEN_KEY } from './ProofHelp'
import { PARA_STYLE_OPTIONS } from './ProofToolbar'

beforeEach(() => {
  window.localStorage.clear()
})

// הרצת כל הטסטים במקביל על מחשב עמוס: 5 השניות של ברירת-המחדל אינן מספיקות לטסט הראשון בקובץ
describe('ProofHelp — "מה עושים בעמוד"', { timeout: 20000 }, () => {
  it('נפתח לבד בפעם הראשונה, עם שלושת הצעדים; "הבנתי" סוגר וזוכר שנראה', async () => {
    const onClose = vi.fn()
    render(<ProofHelp onClose={onClose} />)
    const dialog = await screen.findByRole('dialog', { name: 'מה עושים בעמוד?' })
    expect(dialog).toBeInTheDocument()
    for (const step of ['מסגרות', 'טקסט', 'עיצוב ופסקאות']) expect(screen.getByText(step)).toBeInTheDocument()
    expect(screen.getByText(/עברו בסריקה למצב "שורות"/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'הבנתי, מתחילים' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(HELP_SEEN_KEY)).toBe('1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('אחרי שנראה — לא נפתח לבד, ונפתח כש-open (כפתור "?"); Esc קורא ל-onClose', async () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    const onClose = vi.fn()
    const { rerender } = render(<ProofHelp open={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<ProofHelp open onClose={onClose} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<ProofHelp open={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Esc לא מגיע לחלונות שמתחת (סקירת מנהל נסגרת ב-Esc)', async () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    const below = vi.fn()
    window.addEventListener('keydown', below)
    render(<ProofHelp open onClose={() => {}} />)
    await userEvent.keyboard('{Escape}')
    expect(below).not.toHaveBeenCalled()
    window.removeEventListener('keydown', below)
  })

  it('autoOpen={false} — לא נפתח לבד גם בפעם הראשונה', () => {
    render(<ProofHelp autoOpen={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('שני מופעים (הדף והעורך) — רק אחד נפתח לבד', async () => {
    render(
      <>
        <ProofHelp onClose={() => {}} />
        <ProofHelp onClose={() => {}} />
      </>
    )
    expect(await screen.findAllByRole('dialog')).toHaveLength(1)
  })

  it('"איך עושים" מתקפל ומראה את המקשים, כולל Ctrl+Enter לאישור פסקה', async () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    const toggle = screen.getByRole('button', { name: /איך עושים/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('אישור הפסקה ומעבר לבאה')).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const row = screen.getByText('אישור הפסקה ומעבר לבאה').closest('tr')
    expect(row).toHaveTextContent('Ctrl+Enter')
    expect(screen.getByText('מילה חשודה הבאה / הקודמת').closest('tr')).toHaveTextContent('F8')
  })

  it('מקרא הסימונים גלוי: אדום = לא בטוח ובלי הצעות; כחול/סגול/כתום = יש הצעות', () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    const legend = screen.getByRole('region', { name: 'מה אומרים הסימונים על המילים' })
    expect(legend).toHaveTextContent('קו אדום מקווקו')
    expect(legend).toHaveTextContent('ואין לו הצעות')
    for (const t of ['קו כחול מנוקד', 'רקע סגול', 'רקע כתום']) expect(legend).toHaveTextContent(t)
    // דיבור-המתחיל מודגש אוטומטית בגוון מעומעם (FlowEditor) — מוסבר גם כאן
    expect(legend).toHaveTextContent('מודגש אפור')
  })

  it('כלל אחד לקווים ולקישוטים: קו מפריד ← זרם "מפריד"; קישוט/כתם/רעש ← "לא-שורה" (גם הכפתור שליד שורה ריקה); EN = לועזית', async () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    expect(screen.getByText(/הכפתור "EN" — לועזית/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /איך עושים/ }))
    const rule = screen.getByText('קו מפריד').closest('li')
    expect(rule).toHaveTextContent('לזרם "מפריד"')
    expect(rule).toHaveTextContent('קישוט, כתם או רעש — "לא-שורה"')
    expect(rule).toHaveTextContent('ליד שורה ריקה')
  })

  it('היישור לשני הצדדים — רק תצוגה; הסריקה עוקבת אחרי הסמן (השורה מול השורה, המילה מסומנת)', async () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(/מיושר לשני הצדדים, כמו בספר — זו רק תצוגה/)
    // בצעד "טקסט" — גלוי בלי לפתוח את "איך עושים"
    const step = screen.getByText('טקסט').parentElement
    expect(step).toHaveTextContent('הסריקה זזה עם הסמן')
    expect(step).toHaveTextContent('המילה שבסמן מסומנת שם')
    await userEvent.click(screen.getByRole('button', { name: /איך עושים/ }))
    const follow = screen.getByText('הסריקה עוקבת אחרי הסמן:').closest('li')
    expect(follow).toHaveTextContent('עומדת מול השורה שלה בסריקה')
    expect(follow).toHaveTextContent('בלי להזיז את הסריקה מתחת לעכבר')
    expect(screen.getByText('לזוז בטקסט').closest('tr')).toHaveTextContent('הסריקה זזה איתכם')
  })

  it('סגנונות הפסקה: כל הסגנונות שבסרגל עם ההסבר — כולל סעיף ממוספר, הגהה, שירה ותוכן עניינים', async () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    // הצעד "עיצוב ופסקאות" מזכיר את ארבעת החדשים
    const step = screen.getByText('עיצוב ופסקאות').parentElement
    for (const t of ['סעיף ממוספר', 'הגהה', 'שורות קצרות (שירה)', 'שורת תוכן עניינים']) expect(step).toHaveTextContent(t)
    await userEvent.click(screen.getByRole('button', { name: /איך עושים/ }))
    const list = screen.getByRole('region', { name: 'סגנונות הפסקה' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(PARA_STYLE_OPTIONS.length)
    PARA_STYLE_OPTIONS.forEach((o, k) => expect(items[k]).toHaveTextContent(`${o.he} — ${o.hint}`))
    expect(within(list).getByText('סעיף ממוספר').closest('li')).toHaveTextContent('א גרסינן')
    expect(within(list).getByText('הגהה').closest('li')).toHaveTextContent('בכוכבית או בסוגריים')
  })

  it('ריהוט הדף: איפה בוחרים אותו (במסגרת, או בסוף התפריט "זרם")', async () => {
    render(<ProofHelp open onClose={() => {}} autoOpen={false} />)
    await userEvent.click(screen.getByRole('button', { name: /איך עושים/ }))
    const item = screen.getByText('ריהוט הדף').closest('li')
    expect(item).toHaveTextContent('כותרת-רצה, מספר עמוד וקו מפריד')
    // במסגרת: הכפתור "ריהוט הדף" בבחירת הזרם שלה (בחלונית המסגרת ובסרגל "מסגרת חדשה")
    expect(item).toHaveTextContent('במסגרת סביבה (בבחירת הזרם של המסגרת: "ריהוט הדף")')
    expect(item).toHaveTextContent('בתפריט "זרם" שבסרגל (בסוף התפריט: "ריהוט הדף · כותרת עמוד / תחתית / מפריד")')
    expect(item).toHaveTextContent('ללשונית "ריהוט הדף"')
  })

  it('לחיצה על הרקע סוגרת', async () => {
    const onClose = vi.fn()
    render(<ProofHelp open onClose={onClose} autoOpen={false} />)
    await userEvent.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
