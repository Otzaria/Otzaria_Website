import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProofHelp, { HELP_INTRO, HELP_SEEN_KEY, guideOf, openGuide } from './ProofHelp'
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

describe('ProofHelp — שאלות שחוזרות (מהפורום)', () => {
  it('אותיות פגומות, כותרת מול ריהוט, שם פרק רק בכותרת-הרצה, חיבור פסקאות, "ממתין לזיהוי-מחדש"', () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    render(<ProofHelp open onClose={vi.fn()} />)
    const faq = screen.getByRole('region', { name: 'שאלות שחוזרות' })
    const q = (key) => faq.querySelector(`[data-faq="${key}"]`)
    expect(q('damaged')).toHaveTextContent(/הקלידו|את האותיות שנועדו להיות שם/)
    expect(q('damaged')).toHaveTextContent('א ו-ל שנדבקו זו לזו — "אל"')
    expect(q('damaged')).toHaveTextContent(/ו שבורה שנראית כמו י/)
    expect(q('damaged')).toHaveTextContent(/רק נקודה/)
    expect(q('headings')).toHaveTextContent(/כותרת-רצה\) ומספר העמוד — "ריהוט הדף"/)
    expect(q('headings')).toHaveTextContent(/לא ריהוט ולא מסגרת נפרדת\. מסמנים אותה בטקסט בסגנון-הפסקה "כותרת"/)
    expect(q('running-only')).toHaveTextContent(/השאירו אותה ריהוט.*בהערה למנהל/)
    expect(q('join')).toHaveTextContent(/Backspace בתחילת הפסקה השנייה.*↑.*חיבור לפסקה הקודמת/)
    expect(q('recut')).toHaveTextContent(/"✓ המבנה נכון — לזיהוי-מחדש": העמוד נשלח, נעול עד שיזוהה מחדש, וחוזר אליכם לשלב הטקסט/)
    expect(q('recut')).toHaveTextContent(/פיצול, איחוד או שינוי תיבה/)
    expect(q('recut')).toHaveTextContent(/"✓ המבנה נכון — לאישור זיהוי-מחדש": העמוד ממתין לאישור מנהל, נעול גם הוא/)
    expect(q('recut')).toHaveTextContent(/בינתיים אפשר לתפוס עמודים אחרים/)
  })
})

// עורך שמוטמע מחוץ לאתר (תוכנת-הספר): אין שם הגשה, מנהל או תפיסת-עמוד — texts מחליף את
// החלקים האלה; בלי texts (האתר) — הנוסח המקורי, כמו בטסטים שלמעלה
describe('ProofHelp — texts (נוסח אחר מחוץ לאתר)', () => {
  it('בלי texts — משפט-הפתיחה, השאלות וסעיף "סיימתי" של האתר', () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    render(<ProofHelp open onClose={vi.fn()} />)
    expect(screen.getByText(HELP_INTRO)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'שאלות שחוזרות' })).toBeInTheDocument()
    expect(screen.getByText('סיימתי — מה עכשיו?')).toBeInTheDocument()
    expect(screen.getByText(/מנהל בודק כל הגשה/)).toBeInTheDocument()
  })

  it('intro, extra, faq ו-done מחליפים את נוסח האתר; מערך ריק מסתיר את הסעיף', () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    const texts = {
      intro: 'פתיחה אחרת',
      extra: <p data-testid="help-extra">תוספת של הדף העוטף</p>,
      faq: [{ key: 'own', q: 'שאלה משלנו?', a: 'תשובה משלנו' }],
      done: [],
    }
    render(<ProofHelp open onClose={vi.fn()} texts={texts} />)
    const dialog = screen.getByRole('dialog', { name: 'מה עושים בעמוד?' })
    expect(within(dialog).getByText('פתיחה אחרת')).toBeInTheDocument()
    expect(within(dialog).queryByText(HELP_INTRO)).toBeNull()
    expect(within(dialog).getByTestId('help-extra')).toHaveTextContent('תוספת של הדף העוטף')
    const faq = within(dialog).getByRole('region', { name: 'שאלות שחוזרות' })
    expect(faq.querySelectorAll('[data-faq]')).toHaveLength(1)
    expect(faq.querySelector('[data-faq="own"]')).toHaveTextContent('שאלה משלנו?תשובה משלנו')
    expect(within(dialog).queryByText('סיימתי — מה עכשיו?')).toBeNull()
    expect(within(dialog).queryByText(/מנהל/)).toBeNull()
  })

  it('faq: [] — בלי סעיף השאלות', () => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1')
    render(<ProofHelp open onClose={vi.fn()} texts={{ faq: [] }} />)
    expect(screen.queryByRole('region', { name: 'שאלות שחוזרות' })).toBeNull()
    expect(screen.getByText(HELP_INTRO)).toBeInTheDocument()
  })
})

// דף ההנחיות למתנדבים (2026-10-05): קישור בחלון העזרה — באתר לשונית חדשה; עורך מוטמע פותח בעצמו (help.guide.open)
describe('ProofHelp — קישור לדף ההנחיות', { timeout: 20000 }, () => {
  it('באתר: קישור ל-/docs/page-proof בלשונית חדשה', () => {
    render(<ProofHelp open onClose={() => {}} />)
    const a = screen.getByRole('link', { name: /הנחיות להגהה/ })
    expect(a).toHaveAttribute('href', '/docs/page-proof')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('עורך מוטמע: guide.open מקבל את הכתובת (ולא ניווט בדף); guide: null — בלי הקישור', async () => {
    const open = vi.fn()
    const { unmount } = render(<ProofHelp open onClose={() => {}} texts={{ guide: { href: 'https://example.org/docs/page-proof', open } }} />)
    const a = screen.getByRole('link', { name: /הנחיות להגהה/ })
    expect(a).toHaveAttribute('href', 'https://example.org/docs/page-proof')
    await userEvent.click(a)
    expect(open).toHaveBeenCalledWith('https://example.org/docs/page-proof')
    unmount()
    render(<ProofHelp open onClose={() => {}} texts={{ guide: null }} />)
    expect(screen.queryByRole('link', { name: /הנחיות להגהה/ })).toBeNull()
  })

  it('guideOf / openGuide: ברירת-המחדל, href בלי open — לשונית חדשה', () => {
    expect(guideOf(null)).toEqual({ href: '/docs/page-proof', open: null })
    expect(guideOf({ guide: false })).toBeNull()
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null)
    openGuide(guideOf({ guide: { href: '/x' } }))
    expect(spy).toHaveBeenCalledWith('/x', '_blank', 'noopener,noreferrer')
    spy.mockRestore()
  })
})
