import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  useDragReorder,
  StatusBadge,
  MiniImage,
  PluginPicker,
  OrderedPluginRow
} from './StoreLayoutShared'

describe('StatusBadge', () => {
  it('renders the Hebrew label for a known status', () => {
    render(<StatusBadge status="beta" />)
    expect(screen.getByText('בטא')).toBeInTheDocument()
  })

  it('falls back to the raw status for an unknown value', () => {
    render(<StatusBadge status="mystery" />)
    expect(screen.getByText('לא ידוע')).toBeInTheDocument()
  })
})

describe('MiniImage', () => {
  it('renders an img when src is provided', () => {
    render(<MiniImage src="/img.png" alt="תוסף" />)
    expect(screen.getByRole('img', { name: 'תוסף' })).toHaveAttribute('src', '/img.png')
  })

  it('renders a placeholder icon when there is no src', () => {
    render(<MiniImage src={null} alt="תוסף" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('extension')).toBeInTheDocument()
  })
})

describe('PluginPicker', () => {
  const options = [
    { id: 'a', name: 'תוסף אלף', version: '1.0.0', status: 'stable', image: null },
    { id: 'b', name: 'תוסף בית', version: '2.0.0', status: 'beta', image: null }
  ]

  it('excludes already-assigned plugins and filters by query', async () => {
    render(<PluginPicker options={options} excludeIds={['b']} onSelect={vi.fn()} />)
    const input = screen.getByPlaceholderText('הוסף תוסף — חיפוש לפי שם...')
    await userEvent.setup().click(input)

    expect(screen.getByText('תוסף אלף')).toBeInTheDocument()
    expect(screen.queryByText('תוסף בית')).not.toBeInTheDocument()
  })

  it('calls onSelect and clears the query when a result is chosen', async () => {
    const onSelect = vi.fn()
    render(<PluginPicker options={options} excludeIds={[]} onSelect={onSelect} />)
    const input = screen.getByPlaceholderText('הוסף תוסף — חיפוש לפי שם...')
    await userEvent.setup().type(input, 'אלף')

    await userEvent.setup().click(screen.getByText('תוסף אלף'))
    expect(onSelect).toHaveBeenCalledWith(options[0])
  })

  it('shows a not-found message when nothing matches the query', async () => {
    render(<PluginPicker options={options} excludeIds={[]} onSelect={vi.fn()} />)
    const input = screen.getByPlaceholderText('הוסף תוסף — חיפוש לפי שם...')
    await userEvent.setup().type(input, 'לא קיים')
    expect(screen.getByText('לא נמצאו תוספים מתאימים')).toBeInTheDocument()
  })
})

describe('OrderedPluginRow', () => {
  const basePlugin = {
    id: 'p1',
    name: 'תוסף לדוגמה',
    status: 'stable',
    downloadCount: 5,
    isApproved: true,
    isHidden: false,
    isSuspended: false,
    image: null
  }

  it('renders plugin details without a ghost warning when it will actually show in the store', () => {
    render(<OrderedPluginRow plugin={basePlugin} index={0} total={2} onMove={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('תוסף לדוגמה')).toBeInTheDocument()
    expect(screen.getByText('5 הורדות')).toBeInTheDocument()
    expect(screen.queryByText('לא יוצג בפועל')).not.toBeInTheDocument()
  })

  it('shows a ghost warning for a suspended plugin', () => {
    render(<OrderedPluginRow plugin={{ ...basePlugin, isSuspended: true }} index={0} total={2} onMove={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('מושהה — לא יוצג בפועל')).toBeInTheDocument()
  })

  it('disables the up arrow on the first item and the down arrow on the last', () => {
    render(<OrderedPluginRow plugin={basePlugin} index={0} total={2} onMove={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByTitle('הזז למעלה')).toBeDisabled()
    expect(screen.getByTitle('הזז למטה')).not.toBeDisabled()
  })

  it('calls onMove with the direction and onRemove with the index', async () => {
    const onMove = vi.fn()
    const onRemove = vi.fn()
    render(<OrderedPluginRow plugin={basePlugin} index={1} total={3} onMove={onMove} onRemove={onRemove} />)

    const user = userEvent.setup()
    await user.click(screen.getByTitle('הזז למעלה'))
    expect(onMove).toHaveBeenCalledWith(1, -1)

    await user.click(screen.getByTitle('הזז למטה'))
    expect(onMove).toHaveBeenCalledWith(1, 1)

    await user.click(screen.getByTitle('הסר מהרשימה'))
    expect(onRemove).toHaveBeenCalledWith(1)
  })
})

describe('useDragReorder', () => {
  function makeDataTransfer() {
    return { effectAllowed: '', dropEffect: '' }
  }

  it('calls onReorder with the drag source and drop target indices', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useDragReorder(onReorder))

    let propsAt0, propsAt2
    act(() => {
      propsAt0 = result.current(0)
    })
    const dt = makeDataTransfer()
    act(() => {
      propsAt0.onDragStart({ dataTransfer: dt })
    })
    act(() => {
      propsAt2 = result.current(2)
    })
    act(() => {
      propsAt2.onDrop({ preventDefault: () => {}, dataTransfer: dt })
    })

    expect(onReorder).toHaveBeenCalledWith(0, 2)
  })

  it('does not call onReorder when dropping on the same index', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useDragReorder(onReorder))
    const dt = makeDataTransfer()

    act(() => {
      result.current(1).onDragStart({ dataTransfer: dt })
    })
    act(() => {
      result.current(1).onDrop({ preventDefault: () => {}, dataTransfer: dt })
    })

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('resets drag state on drag end', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useDragReorder(onReorder))
    const dt = makeDataTransfer()

    act(() => {
      result.current(0).onDragStart({ dataTransfer: dt })
    })
    expect(result.current(0).className).toContain('opacity-40')

    act(() => {
      result.current(0).onDragEnd()
    })
    expect(result.current(0).className).not.toContain('opacity-40')
  })
})
