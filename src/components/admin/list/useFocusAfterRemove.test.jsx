// פוקוס אחרי הסרה — שלוש הדרכים (הגישות שהיו בספרים/העלאות, במשתמשים ובאימון):
//   beforeRemove — לשורה הבאה, לקודמת כשהוסרה האחרונה, ובלי שורות — ל-fallbackId (בלי — לשום מקום); לא גוזל פוקוס.
//   beforeRemove({ always }) — אחרי setTimeout, גם כשהפוקוס במקום אחר.
//   onListFocus — השורה שבאותו מקום; ובלי שורות — ל-fallbackId.
//   focusAfterRender — לשורה שחזרה.
import { describe, expect, test } from 'vitest'
import { act, render } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { useFocusAfterRemove } from './useFocusAfterRemove'

const api = {}
function List({ initial, options, tracked = false }) {
  const [items, setItems] = useState(initial)
  const focus = useFocusAfterRemove(options)
  useEffect(() => {
    api.remove = (ids, removeOptions) => {
      if (!tracked) focus.beforeRemove(ids, removeOptions)
      setItems((list) => list.filter((i) => !ids.includes(i)))
    }
    api.restore = (id) => {
      focus.focusAfterRender(id)
      setItems((list) => [...list, id])
    }
  })
  return (
    <>
      <input aria-label="שדה אחר" />
      <ul id="the-list" tabIndex={-1} ref={tracked ? focus.listRef : undefined} onFocus={tracked ? focus.onListFocus : undefined}>
        {items.map((id) => (
          <li key={id} data-row={id} tabIndex={-1}>
            <button type="button" data-row-focus="">{id}</button>
          </li>
        ))}
      </ul>
    </>
  )
}
const row = (id) => document.querySelector(`[data-row="${id}"]`)
const button = (id) => row(id).querySelector('button')
const removeFocused = (id, removeOptions) => {
  button(id).focus()
  act(() => api.remove([id], removeOptions))
}
const wait = () => act(() => new Promise((r) => setTimeout(r, 0)))

describe('useFocusAfterRemove — beforeRemove (כמו האימון)', () => {
  test('שורה באמצע — לשורה הבאה', () => {
    render(<List initial={['a', 'b', 'c']} />)
    removeFocused('b')
    expect(row('c')).toHaveFocus()
  })

  test('השורה האחרונה — לקודמת', () => {
    render(<List initial={['a', 'b', 'c']} />)
    removeFocused('c')
    expect(row('b')).toHaveFocus()
  })

  test('השורה היחידה, בלי fallbackId — לשום מקום', () => {
    render(<List initial={['a']} />)
    removeFocused('a')
    expect(document.activeElement).toBe(document.body)
  })

  test('השורה היחידה, עם fallbackId — לרשימה', () => {
    render(<List initial={['a']} options={{ fallbackId: 'the-list' }} />)
    removeFocused('a')
    expect(document.getElementById('the-list')).toHaveFocus()
  })

  test('פוקוס בשדה אחר — לא נגזל', () => {
    const { getByLabelText } = render(<List initial={['a', 'b']} />)
    getByLabelText('שדה אחר').focus()
    act(() => api.remove(['a']))
    expect(getByLabelText('שדה אחר')).toHaveFocus()
  })

  test('focusIn — לאלמנט שבתוך השורה', () => {
    render(<List initial={['a', 'b']} options={{ focusIn: '[data-row-focus]' }} />)
    removeFocused('a')
    expect(button('b')).toHaveFocus()
  })
})

describe('useFocusAfterRemove — beforeRemove({ always }) (כמו המשתמשים)', () => {
  const options = { focusIn: '[data-row-focus]', fallbackId: 'the-list', rootId: 'the-list', preventScroll: true }

  test('גם כשהפוקוס בשדה אחר — לשורה הבאה, אחרי רגע', async () => {
    const { getByLabelText } = render(<List initial={['a', 'b', 'c']} options={options} />)
    getByLabelText('שדה אחר').focus()
    act(() => api.remove(['b'], { always: true }))
    await wait()
    expect(button('c')).toHaveFocus()
  })

  test('האחרונה — לקודמת; היחידה — לרשימה', async () => {
    const first = render(<List initial={['a', 'b']} options={options} />)
    removeFocused('b', { always: true })
    await wait()
    expect(button('a')).toHaveFocus()
    first.unmount()
    render(<List initial={['a']} options={options} />)
    removeFocused('a', { always: true })
    await wait()
    expect(document.getElementById('the-list')).toHaveFocus()
  })
})

describe('useFocusAfterRemove — onListFocus (כמו ספרים והעלאות)', () => {
  const options = { focusIn: '[data-row-focus]', fallbackId: 'the-list' }

  test('שורה באמצע — לשורה שבאה במקומה', () => {
    render(<List initial={['a', 'b', 'c']} options={options} tracked />)
    removeFocused('b')
    expect(button('c')).toHaveFocus()
  })

  test('השורה האחרונה — לשורה שלפניה', () => {
    render(<List initial={['a', 'b', 'c']} options={options} tracked />)
    removeFocused('c')
    expect(button('b')).toHaveFocus()
  })

  test('השורה היחידה — לרשימה', () => {
    render(<List initial={['a']} options={options} tracked />)
    removeFocused('a')
    expect(document.getElementById('the-list')).toHaveFocus()
  })

  test('focusAfterRender — לשורה שחזרה', () => {
    render(<List initial={['a', 'b']} options={options} tracked />)
    act(() => api.restore('z'))
    expect(button('z')).toHaveFocus()
  })
})
