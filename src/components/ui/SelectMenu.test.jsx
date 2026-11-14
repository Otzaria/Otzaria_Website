// ui/SelectMenu — הבורר המעוצב: ARIA, מקלדת (חיצים, Home/End, הקלדה, Enter, Esc, Tab), בחירה מרובה,
// חיפוש, מונים ו"נקה".
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import SelectMenu from './SelectMenu'

const STATUSES = [
  { value: 'not_checked', label: 'לא נבדק', count: 1848, color: '#94a3b8' },
  { value: 'needs_attention', label: 'דורש טיפול', count: 12, color: '#f59e0b' },
  { value: 'ready', label: 'תקין ומוכן להכנסה', count: 3 },
  { value: 'added', label: 'הוכנס לספרייה', count: 0 },
]

function Controlled({ initial, onChange = () => {}, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <SelectMenu value={value} onChange={(v) => { setValue(v); onChange(v) }} {...props} />
      <button type="button">אחרי</button>
    </>
  )
}

const trigger = (name = /מצב/) => screen.getByRole('button', { name })
const options = () => within(screen.getByRole('listbox')).getAllByRole('option')
const activeOption = () => {
  const owner = document.activeElement
  const id = owner.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

describe('SelectMenu', () => {
  test('ARIA: כפתור עם aria-haspopup ו-aria-expanded, רשימה עם aria-selected, ושם נגיש שכולל את הערך', async () => {
    const user = userEvent.setup()
    render(<Controlled label="מצב" options={STATUSES} initial="ready" />)
    const button = trigger(/מצב תקין ומוכן להכנסה/)
    expect(button).toHaveAttribute('aria-haspopup', 'listbox')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const listbox = screen.getByRole('listbox', { name: 'מצב' })
    expect(button).toHaveAttribute('aria-controls', listbox.id)
    expect(listbox).not.toHaveAttribute('aria-multiselectable')
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false'])
    // מונים, בפורמט עברי
    expect(options()[0]).toHaveTextContent('1,848')
  })

  test('מקלדת בבחירה אחת: ↓ פותח על הנבחרת, חיצים / Home / End זזים, Enter בוחר, סוגר ומחזיר פוקוס', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled label="מצב" options={STATUSES} initial="needs_attention" onChange={onChange} />)
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    expect(activeOption()).toHaveTextContent('דורש טיפול')
    await user.keyboard('{ArrowDown}')
    expect(activeOption()).toHaveTextContent('תקין ומוכן')
    await user.keyboard('{End}')
    expect(activeOption()).toHaveTextContent('הוכנס לספרייה')
    await user.keyboard('{ArrowDown}') // בלי גלישה מהקצה
    expect(activeOption()).toHaveTextContent('הוכנס לספרייה')
    await user.keyboard('{Home}')
    expect(activeOption()).toHaveTextContent('לא נבדק')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith('not_checked')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAccessibleName('מצב לא נבדק')
  })

  test('הקלדה ברשימה בלי חיפוש קופצת לאפשרות לפי תחילית', async () => {
    const user = userEvent.setup()
    render(<Controlled label="מצב" options={[...STATUSES, { value: 'dup', label: 'דחוי' }]} initial="ready" />)
    trigger().focus()
    await user.keyboard('{Enter}')
    await user.keyboard('דח')
    expect(activeOption()).toHaveTextContent('דחוי')
  })

  test('אות על הכפתור (בלי חיפוש) פותחת וקופצת; אותה אות שוב — לבאה שמתחילה בה', async () => {
    const user = userEvent.setup()
    render(<Controlled label="מצב" options={[...STATUSES, { value: 'dup', label: 'דחוי' }]} initial="ready" />)
    trigger().focus()
    await user.keyboard('ד')
    expect(activeOption()).toHaveTextContent('דורש טיפול')
    await user.keyboard('ד')
    expect(activeOption()).toHaveTextContent('דחוי')
  })

  test('Esc סוגר בלי לשנות ומחזיר פוקוס; Tab סוגר וממשיך הלאה', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled label="מצב" options={STATUSES} initial="ready" onChange={onChange} />)
    await user.click(trigger())
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.tab()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'אחרי' })).toHaveFocus()
  })

  test('בחירה מרובה: Enter ולחיצה מסמנים בלי לסגור, "נקה" מנקה, והכפתור מסכם', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled label="מצב" options={STATUSES} initial={[]} multiple onChange={onChange} />)
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')
    await user.keyboard('{Enter}')
    await user.click(options()[2])
    expect(onChange).toHaveBeenLastCalledWith(['not_checked', 'ready'])
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'true', 'false'])
    // רווח מסמן גם הוא (אין שדה חיפוש)
    await user.keyboard('{ArrowUp} ')
    expect(onChange).toHaveBeenLastCalledWith(['not_checked', 'needs_attention', 'ready'])

    await user.click(screen.getByRole('button', { name: 'סיום' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger()).toHaveAccessibleName('מצב לא נבדק ועוד 2')

    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'נקה' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('button', { name: 'נקה' })).toBeDisabled()
  })

  test('חיפוש: אות על הכפתור פותחת ומתחילה לחפש; הסינון מתעלם מניקוד ורווחים; Enter בוחר את הראשונה', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const users = Array.from({ length: 12 }, (_, i) => ({ value: `u${i}@x`, label: `משתמש ${i}`, hint: `u${i}@x`, count: i }))
    users.push({ value: 'moshe@x', label: 'משה כהן', hint: 'moshe@x', count: 40 })
    render(<Controlled label="משתמש" options={users} initial={[]} multiple onChange={onChange} />)
    trigger(/משתמש/).focus()
    await user.keyboard('מ')
    const search = screen.getByRole('combobox', { name: /משתמש/ })
    expect(search).toHaveFocus()
    expect(search).toHaveValue('מ')
    await user.keyboard('שה כ')
    expect(options()).toHaveLength(1)
    expect(search).toHaveAttribute('aria-activedescendant', options()[0].id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['moshe@x'])

    await user.clear(search)
    await user.type(search, 'אין כזה')
    expect(within(screen.getByRole('listbox')).getByText('לא נמצאו אפשרויות')).toBeInTheDocument()
    // חיפוש לפי הדואר (הרמז)
    await user.clear(search)
    await user.type(search, 'u11@')
    expect(options()).toHaveLength(1)
  })

  test('"הכול" (allLabel) בראש הרשימה מנקה בבחירה אחת; action — כל בחירה מפעילה', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled label="סוג" options={[{ value: 'full_book', label: 'ספרים' }]} initial="full_book" allLabel="הכול" onChange={onChange} />)
    await user.click(trigger(/סוג/))
    await user.click(screen.getByRole('option', { name: 'הכול' }))
    expect(onChange).toHaveBeenLastCalledWith('')

    const act = vi.fn()
    render(<SelectMenu label="שנה את המצב של הנבחרים" variant="action" triggerText="שנה מצב" options={STATUSES} value={null} onChange={act} />)
    const button = screen.getByRole('button', { name: 'שנה את המצב של הנבחרים' })
    expect(button).toHaveTextContent('שנה מצב')
    await user.click(button)
    await user.click(screen.getByRole('option', { name: /דורש טיפול/ }))
    expect(act).toHaveBeenCalledWith('needs_attention')
  })

  test('בחירה מרובה: שתי בחירות מהירות, לפני שההורה מחזיר ערך, לא דורסות זו את זו', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // ההורה לא מעדכן את value (כמו כתובת שמתעדכנת באיחור)
    render(<SelectMenu label="מצב" options={STATUSES} value={[]} multiple onChange={onChange} />)
    trigger().focus()
    await user.keyboard('{ArrowDown}{Enter}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['not_checked', 'needs_attention'])
  })

  test('מושבת — לא נפתח', async () => {
    const user = userEvent.setup()
    render(<SelectMenu label="מצב" options={STATUSES} value="ready" onChange={() => {}} disabled />)
    await user.click(trigger())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  test('מקשים שהבורר טיפל בהם לא מגיעים למאזיני המקלדת של הדף (window)', async () => {
    const user = userEvent.setup()
    const seen = []
    const onWindowKey = (event) => seen.push(event.key)
    window.addEventListener('keydown', onWindowKey)
    try {
      render(<Controlled label="מצב" options={STATUSES} initial="ready" />)
      trigger().focus()
      await user.keyboard('{Enter}') // פותח
      await user.keyboard('{ArrowDown}1{Delete}n{Enter}') // תזוזה, מקשים שלא תואמים אפשרות, ובחירה
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      await user.keyboard('ל') // אות על הכפתור — פותחת וקופצת
      await user.keyboard('{Escape}')
      expect(seen).toEqual([])
      // אחרי שהרשימה נסגרה והפוקוס על הכפתור — מקש שהבורר לא משתמש בו ממשיך כרגיל
      await user.keyboard('{Delete}')
      expect(seen).toEqual(['Delete'])
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })
})
