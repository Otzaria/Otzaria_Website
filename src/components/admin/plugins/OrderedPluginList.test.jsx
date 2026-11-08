// רשימה מסודרת: הזזה בחצים (הפוקוס נשאר, והמקום החדש מוכרז), קצה הרשימה, "הסר", הוספה, ומצב בלי סידור.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import OrderedPluginList, { ReorderButtons } from './OrderedPluginList'

const ITEMS = [{ id: 'a', name: 'אלף' }, { id: 'b', name: 'בית' }, { id: 'c', name: 'גימל', isSuspended: true }]

function Harness({ initial = ITEMS, onChange, ...props }) {
  const [items, setItems] = useState(initial)
  return (
    <OrderedPluginList
      items={items}
      onChange={(next) => { setItems(next); onChange?.(next) }}
      options={[...ITEMS, { id: 'd', name: 'דלת' }]}
      label="הרשימה"
      addLabel="הוסף"
      emptyText="ריק"
      {...props}
    />
  )
}

const names = () => within(screen.getByRole('list', { name: 'הרשימה' })).getAllByRole('listitem').map((li) => li.textContent)

describe('OrderedPluginList', () => {
  test('חץ: הסדר משתנה, הפוקוס נשאר על אותו חץ, והמקום החדש מוכרז', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'הזז למטה: אלף' }))
    expect(names()[1]).toContain('אלף')
    expect(screen.getByRole('button', { name: 'הזז למטה: אלף' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('״אלף״ הועבר למקום 2 מתוך 3')
  })

  test('הגעה לקצה: החץ מושבת, והפוקוס עובר לחץ ההפוך ולא נופל לראש העמוד', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'הזז למעלה: בית' }))
    expect(screen.getByRole('button', { name: 'הזז למעלה: בית' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'הזז למטה: בית' })).toHaveFocus()
  })

  test('"הסר": הפוקוס עובר ל"הסר" של השורה הבאה, ומוכרז; אחרי האחרונה — לרשימה', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initial={ITEMS.slice(0, 2)} />)
    await user.click(screen.getByRole('button', { name: 'הסר: אלף' }))
    expect(screen.getByRole('button', { name: 'הסר: בית' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('״אלף״ הוסר מהרשימה')
    await user.click(screen.getByRole('button', { name: 'הסר: בית' }))
    expect(screen.getByText('ריק')).toBeInTheDocument()
    expect(container.firstChild).toHaveFocus()
  })

  test('תוסף שלא יוצג מסומן ולמה', () => {
    render(<Harness />)
    expect(screen.getByText('מושהה — לא יוצג')).toBeInTheDocument()
  })

  test('reorderable=false: בלי חצים ובלי גרירה, והסרה עובדת', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness reorderable={false} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: /^הזז/ })).toBeNull()
    expect(screen.getByRole('list', { name: 'הרשימה' }).querySelector('[draggable="true"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'הסר: אלף' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('הוספה מציעה רק מי שלא ברשימה', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /הוסף/ }))
    await user.click(await screen.findByRole('option', { name: 'דלת' }))
    expect(onChange.mock.calls[0][0].map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('ReorderButtons: busy — לא מגיב, אבל לא disabled, כדי שהפוקוס יישאר', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<ReorderButtons name="א" index={1} count={3} busy onMove={onMove} />)
    const up = screen.getByRole('button', { name: 'הזז למעלה: א' })
    expect(up).not.toBeDisabled()
    expect(up).toHaveAttribute('aria-disabled', 'true')
    await user.click(up)
    expect(onMove).not.toHaveBeenCalled()
  })
})
