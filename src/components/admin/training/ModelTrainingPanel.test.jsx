import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ModelTrainingPanel from './ModelTrainingPanel'
const m = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/components/admin/list/adminRequest', () => ({ requestJson: m.request }))
const book = { id: 'a'.repeat(24), name: 'ספר לדוגמה' }
beforeEach(() => {
  sessionStorage.clear(); vi.resetAllMocks()
  m.request.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') return { job: { id: 'job', status: 'queued' } }
    return { enabled: true, jobs: [] }
  })
})
it('requires explicit acknowledgement and queues training rather than an OCR request', async () => {
  render(<ModelTrainingPanel book={book} />)
  const submit = await screen.findByRole('button', { name: 'שלח את חמשת העמודים והטקסט לאימון' })
  expect(submit).toBeDisabled()
  fireEvent.click(screen.getByLabelText('בדקתי שהטקסט בחמשת העמודים תואם לסריקות, ואני מאשר/ת אימון והמתנה של עבודות הזיהוי'))
  await waitFor(() => expect(submit).toBeEnabled())
  fireEvent.click(submit)
  await waitFor(() => expect(m.request.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true))
  const [url, options] = m.request.mock.calls.find(([, o]) => o?.method === 'POST')
  expect(url).toBe('/api/admin/model-training')
  expect(JSON.parse(options.body)).toMatchObject({ bookId: book.id, pageNumbers: [1,2,3,4,5], script: 'square', epochs: 4, approved: true })
  expect(m.request.mock.calls.some(([u]) => u.includes('/ocr/start'))).toBe(false)
})
it('keeps the same id on a network retry and never treats completion of tagging as automatic approval', async () => {
  m.request.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') throw new Error('אין חיבור')
    return { enabled: true, jobs: [] }
  })
  render(<ModelTrainingPanel book={book} />)
  fireEvent.click(screen.getByLabelText('בדקתי שהטקסט בחמשת העמודים תואם לסריקות, ואני מאשר/ת אימון והמתנה של עבודות הזיהוי'))
  const button = screen.getByRole('button', { name: 'שלח את חמשת העמודים והטקסט לאימון' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button); await screen.findByRole('alert')
  fireEvent.click(button)
  await waitFor(() => expect(m.request.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(2))
  const bodies = m.request.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o.body))
  expect(bodies[0].requestId).toBe(bodies[1].requestId)
  expect(bodies[0].approved).toBe(true)
})
