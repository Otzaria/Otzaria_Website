import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LegacyBookInfoQueue from './LegacyBookInfoQueue'
import BookInfoChangeSetsList from './BookInfoChangeSetsList'

const legacyRows = [
  {
    id: 'c1',
    submittedBy: 'משה',
    updatedAt: '2026-09-01T10:00:00.000Z',
    approved: { bookName: 'אור שמח', startYear: null },
    changes: { startYear: 1843, endYear: 1926 },
    changedFields: ['startYear', 'endYear']
  },
  {
    id: 'c2',
    submittedBy: 'דוד',
    updatedAt: '2026-09-02T10:00:00.000Z',
    approved: { bookName: 'משך חכמה' },
    changes: { generationName: 'אחרונים' },
    changedFields: ['generationName']
  }
]

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

describe('LegacyBookInfoQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when the legacy queue is empty', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => jsonResponse({ success: true, rows: [] }))
    const { container } = render(<LegacyBookInfoQueue />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('publishes each selected suggestion in its own request and keeps the ones that failed', async () => {
    const onPublished = vi.fn()
    const posts = []
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      if (init?.method !== 'POST') return jsonResponse({ success: true, rows: legacyRows })
      const body = JSON.parse(init.body)
      posts.push(body)
      return body.selections[0].changeId === 'c1'
        ? jsonResponse({ success: true, prNumber: 7, prUrl: 'https://github.com/x/pull/7' })
        : jsonResponse({ success: false, error: 'אין שינוי מול הנתון בקובץ' }, 400)
    })

    render(<LegacyBookInfoQueue onPublished={onPublished} />)
    expect(await screen.findByText('הצעות מהתור הישן (2)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'סמן הכל' }))
    await userEvent.click(screen.getByRole('button', { name: 'העבר מסומן ל-PR' }))

    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1))
    expect(posts).toEqual([
      { action: 'publish', selections: [{ changeId: 'c1', fields: ['startYear', 'endYear'] }] },
      { action: 'publish', selections: [{ changeId: 'c2', fields: ['generationName'] }] }
    ])
    expect(screen.queryByText('אור שמח')).not.toBeInTheDocument()
    expect(screen.getByText('משך חכמה')).toBeInTheDocument()
    expect(screen.getByText('אין שינוי מול הנתון בקובץ')).toBeInTheDocument()
  })
})

describe('BookInfoChangeSetsList', () => {
  const changeSets = [
    { id: 'a', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167 }, status: 'open', prNumber: 3, prUrl: 'https://github.com/x/pull/3', submittedBy: 'משה', createdAt: '2026-09-01T10:00:00.000Z' },
    { id: 'b', book: 'בראשית רבה', author: '', changes: { startYear: 301 }, status: 'merged', prNumber: 2, prUrl: 'https://github.com/x/pull/2', submittedBy: null, createdAt: '2026-08-01T10:00:00.000Z' }
  ]

  it('shows open requests with a link to the PR, and all of them on demand', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => jsonResponse({ success: true, rows: changeSets }))
    render(<BookInfoChangeSetsList />)

    expect(await screen.findByText('אבן עזרא')).toBeInTheDocument()
    expect(screen.getByText('ממתין למיזוג')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /#3/ })).toHaveAttribute('href', 'https://github.com/x/pull/3')
    expect(screen.queryByText('בראשית רבה')).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('רק בקשות פתוחות'))
    expect(screen.getByText('בראשית רבה')).toBeInTheDocument()
    expect(screen.getByText('מוזג')).toBeInTheDocument()
  })
})
