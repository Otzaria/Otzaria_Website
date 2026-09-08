import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadFilters from './UploadFilters'

const uniqueUsers = [
  { name: 'אלמוני', email: 'a@b.com', key: 'a@b.com' },
  { name: 'פלוני', email: 'p@b.com', key: 'p@b.com' },
]

const bookStatuses = {
  not_checked: { label: 'לא נבדק', color: '#999999' },
  approved: { label: 'אושר', color: '#00ff00' },
}

function Harness({
  initialFilterUsers = [] as string[],
  initialFilterStatuses = [] as string[],
} = {}) {
  const [filterUsers, setFilterUsers] = useState<string[]>(initialFilterUsers)
  const [filterStatuses, setFilterStatuses] = useState<string[]>(initialFilterStatuses)
  return (
    <>
      <UploadFilters
        uniqueUsers={uniqueUsers}
        filterUsers={filterUsers}
        setFilterUsers={setFilterUsers}
        bookStatuses={bookStatuses}
        filterStatuses={filterStatuses}
        setFilterStatuses={setFilterStatuses}
      />
      <div data-testid="debug-users">{JSON.stringify(filterUsers)}</div>
      <div data-testid="debug-statuses">{JSON.stringify(filterStatuses)}</div>
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UploadFilters', () => {
  it('opens the user dropdown and toggles a user filter on/off', async () => {
    render(<Harness />)
    const user = userEvent.setup()

    await user.click(screen.getByText('סינון לפי משתמש'))
    expect(screen.getByPlaceholderText('חיפוש משתמש...')).toBeInTheDocument()

    await user.click(screen.getByText('אלמוני'))
    expect(screen.getByTestId('debug-users')).toHaveTextContent('["a@b.com"]')
  })

  it('filters the user list by the search box', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByText('סינון לפי משתמש'))
    await user.type(screen.getByPlaceholderText('חיפוש משתמש...'), 'פלו')

    expect(screen.getByText('פלוני')).toBeInTheDocument()
    expect(screen.queryByText('אלמוני')).not.toBeInTheDocument()
  })

  it('closes the user dropdown when clicking outside its container', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByText('סינון לפי משתמש'))
    expect(screen.getByPlaceholderText('חיפוש משתמש...')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByPlaceholderText('חיפוש משתמש...')).not.toBeInTheDocument()
  })

  it('opens the status filter menu and toggles a status', async () => {
    render(<Harness />)
    const user = userEvent.setup()

    await user.click(screen.getByText('סינון לפי סטטוס'))
    expect(screen.getByText('אושר')).toBeInTheDocument()

    await user.click(screen.getByText('אושר'))
    expect(screen.getByTestId('debug-statuses')).toHaveTextContent('["approved"]')
  })

  it('closes the status filter menu when clicking outside its container', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(screen.getByText('סינון לפי סטטוס'))
    expect(screen.getByText('אושר')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByText('אושר')).not.toBeInTheDocument()
  })

  it('resets user filters via the "close" icon on the button once selected', async () => {
    render(<Harness initialFilterUsers={['a@b.com']} />)
    const user = userEvent.setup()
    // when a user is selected, an inline "close" icon appears on the button itself
    const closeIcon = screen.getByText('close')
    await user.click(closeIcon)
    expect(screen.getByTestId('debug-users')).toHaveTextContent('[]')
  })
})
