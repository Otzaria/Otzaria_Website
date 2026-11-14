// לשוניות בתוך אזור: מקלדת (חיצים לפי כיוון הקריאה, Home / End), רק הפעילה ב-Tab order, והפוקוס עובר
// ללשונית החדשה רק אחרי שהיא באמת נבחרה — מעבר שנעצר (למשל "לצאת בלי לשמור?") לא מזיז את הפוקוס.
import { describe, expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import Tabs, { tabPanelProps } from './Tabs'

const ITEMS = [{ id: 'a', label: 'ראשונה' }, { id: 'b', label: 'שנייה', shortLabel: 'ש' }, { id: 'c', label: 'שלישית' }]

function Harness({ allow = () => true, start = 'a' }) {
  const [value, setValue] = useState(start)
  return (
    <div dir="rtl">
      <Tabs label="לשוניות" idPrefix="t" items={ITEMS} value={value} onChange={async (id) => { if (await allow(id)) setValue(id) }} />
      <div {...tabPanelProps('t', value)}>לוח {value}</div>
    </div>
  )
}

describe('Tabs', () => {
  test('tablist עם שם, aria-selected ו-aria-controls, ורק הפעילה ב-Tab order', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'לשוניות' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0].id)
    // השם הנגיש — המלא, גם כשיש שם קצר
    expect(screen.getByRole('tab', { name: 'שנייה' })).toBeInTheDocument()
  })

  test('RTL: חץ שמאלה — הבאה, ימינה — הקודמת (במעגל); Home / End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('tab', { name: 'ראשונה' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'שנייה' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'שנייה' })).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'שלישית' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'ראשונה' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'שלישית' })).toHaveAttribute('aria-selected', 'true')
  })

  test('מעבר שנעצר: הלשונית לא נבחרת והפוקוס לא זז אליה', async () => {
    const user = userEvent.setup()
    let release
    render(<Harness allow={() => new Promise((r) => { release = r })} />)
    const first = screen.getByRole('tab', { name: 'ראשונה' })
    first.focus()
    await user.keyboard('{ArrowLeft}')
    await act(async () => { release(false) })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'שנייה' })).not.toHaveFocus()
  })

  test('מונה ליד השם — והשם הנגיש כולל את הנוסח לקורא המסך', () => {
    render(<Tabs label="ל" idPrefix="m" value="a" onChange={() => {}} items={[{ id: 'a', label: 'לאישור', count: 1200, countLabel: '1,200 ממתינים' }, { id: 'b', label: 'ארכיון' }]} />)
    expect(screen.getByRole('tab', { name: /^לאישור\s*,\s*1,200 ממתינים$/ })).toBeInTheDocument()
    expect(screen.getByText('1,200')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('tab', { name: 'ארכיון' })).toBeInTheDocument()
  })
})
