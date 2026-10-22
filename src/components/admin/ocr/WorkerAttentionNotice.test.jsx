import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorkerAttentionNotice from './WorkerAttentionNotice'
import LocalOcrJobProgress from './LocalOcrJobProgress'

// הודעות needs_attention כפי ש-StatusReporter בשירות (1.0.142) שולח אותן
const MANIFEST_CONFLICT =
  'manifest_conflict: the site sent different immutable data (options, pageMap or input hash) for this job; the original is kept'
const DELIVERY_REJECTED = 'delivery_rejected: the site rejected the result; it is kept on the worker'

const job = (over = {}) => ({
  id: 'j1',
  method: 'local',
  status: 'queued',
  workerState: null,
  workerMessage: null,
  progress: { pagesDone: 0, pagesTotal: 2 },
  totalPages: 2,
  decision: null,
  ...over,
})

describe('WorkerAttentionNotice', () => {
  it('manifest_conflict: תווית עברית, פעולה מוצעת וההודעה המקורית כטקסט LTR', () => {
    render(<WorkerAttentionNotice message={MANIFEST_CONFLICT} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('דורש טיפול במחשב המעבד')
    expect(alert).toHaveTextContent('האתר שלח לעבודה נתונים שונים מהמקוריים')
    expect(alert).toHaveTextContent('בטלו אותה כאן והתחילו עבודה חדשה')
    const original = screen.getByText(MANIFEST_CONFLICT)
    expect(original).toHaveAttribute('dir', 'ltr')
  })

  it('delivery_rejected: תווית עברית והפניה ל-retry-delivery', () => {
    render(<WorkerAttentionNotice message={DELIVERY_REJECTED} />)
    expect(screen.getByRole('alert')).toHaveTextContent('האתר דחה את התוצאה; היא שמורה במחשב המעבד')
    expect(screen.getByRole('alert')).toHaveTextContent('retry-delivery')
  })

  it('בלי הודעה — רק הכותרת', () => {
    render(<WorkerAttentionNotice message="" />)
    const paragraphs = screen.getByRole('alert').querySelectorAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toHaveTextContent('דורש טיפול במחשב המעבד')
  })

  it('הודעה עם תגית HTML מוצגת כטקסט, לא כ-HTML', () => {
    const { container } = render(<WorkerAttentionNotice message="<b>x</b>" />)
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument()
  })
})

describe('LocalOcrJobProgress — מצבים מהעובד', () => {
  const noop = vi.fn()

  it('needs_attention עם manifest_conflict מציג את התווית העברית', () => {
    render(<LocalOcrJobProgress job={job({ status: 'needs_attention', workerState: 'needs_attention', workerMessage: MANIFEST_CONFLICT })} worker={null} onCancel={noop} />)
    expect(screen.getByRole('alert')).toHaveTextContent('האתר שלח לעבודה נתונים שונים מהמקוריים')
  })

  it('queued שדווח מהעובד (חזרה לתור) — הסבר "חזרה לתור", לא "ממתינה שהמחשב יאסוף"', () => {
    render(<LocalOcrJobProgress job={job({ workerState: 'queued' })} worker={null} onCancel={noop} />)
    expect(screen.getByText(/העבודה חזרה לתור במחשב המקומי/)).toBeInTheDocument()
    expect(screen.queryByText(/ממתינה שהמחשב המקומי יאסוף אותה/)).toBeNull()
  })

  it('queued שטרם נאספה — ההסבר הרגיל', () => {
    render(<LocalOcrJobProgress job={job()} worker={null} onCancel={noop} />)
    expect(screen.getByText(/ממתינה שהמחשב המקומי יאסוף אותה/)).toBeInTheDocument()
  })
})
