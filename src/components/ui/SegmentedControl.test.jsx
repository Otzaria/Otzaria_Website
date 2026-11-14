// בחירה אחת כ-radiogroup: Tab נכנס רק לאפשרות הנבחרת, חצים בוחרים ומזיזים פוקוס לפי כיוון הקריאה
// (RTL: שמאלה = קדימה), מעגלי בשני הכיוונים, וערך לא קיים נופל לאפשרות הראשונה.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import SegmentedControl from './SegmentedControl'

const OPTIONS = [{ value: 'a', label: 'א' }, { value: 'b', label: 'ב' }, { value: 'c', label: 'ג' }]

function Harness({ dir = 'rtl', start = 'a', onChange = () => {} }) {
  const [value, setValue] = useState(start)
  return (
    <div dir={dir}>
      <SegmentedControl label="תצוגה" options={OPTIONS} value={value} onChange={(v) => { onChange(v); setValue(v) }} />
    </div>
  )
}

const radio = (name) => screen.getByRole('radio', { name })

describe('SegmentedControl', () => {
  test('radiogroup עם שם, aria-checked ורק הנבחרת ב-Tab order', () => {
    render(<Harness start="b" />)
    expect(screen.getByRole('radiogroup', { name: 'תצוגה' })).toBeInTheDocument()
    expect(radio('ב')).toHaveAttribute('aria-checked', 'true')
    expect(radio('א')).toHaveAttribute('aria-checked', 'false')
    expect(radio('ב')).toHaveAttribute('tabindex', '0')
    expect(radio('א')).toHaveAttribute('tabindex', '-1')
    expect(radio('ג')).toHaveAttribute('tabindex', '-1')
  })

  test('Tab מגיע לאפשרות הנבחרת בלבד', async () => {
    render(<Harness start="c" />)
    await userEvent.tab()
    expect(radio('ג')).toHaveFocus()
  })

  test('RTL: חץ שמאלה קדימה, חץ ימינה אחורה — בוחר ומעביר פוקוס, מעגלי', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.tab()
    await userEvent.keyboard('{ArrowLeft}')
    expect(radio('ב')).toHaveFocus()
    expect(radio('ב')).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(radio('ג')).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('c')
  })

  test('LTR: חץ ימינה קדימה; למעלה/למטה עובדים בשני הכיוונים', async () => {
    render(<Harness dir="ltr" />)
    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(radio('ב')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(radio('ג')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(radio('ג')).toHaveFocus()
  })

  test('לחיצה בוחרת', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(radio('ג'))
    expect(onChange).toHaveBeenCalledWith('c')
    expect(radio('ג')).toHaveAttribute('aria-checked', 'true')
  })

  test('ערך שאינו ברשימה — נופל לאפשרות הראשונה (נבחרת ונגישה ב-Tab)', () => {
    render(<SegmentedControl label="x" options={OPTIONS} value="zzz" onChange={() => {}} />)
    expect(radio('א')).toHaveAttribute('tabindex', '0')
    expect(radio('א')).toHaveAttribute('aria-checked', 'true')
  })

  test('labelledBy גובר על label', () => {
    render(<><span id="lbl">כותרת חיצונית</span><SegmentedControl label="פנימי" labelledBy="lbl" options={OPTIONS} value="a" onChange={() => {}} /></>)
    const group = screen.getByRole('radiogroup', { name: 'כותרת חיצונית' })
    expect(group).not.toHaveAttribute('aria-label')
  })
})
