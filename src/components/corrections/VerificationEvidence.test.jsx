import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VerificationEvidence from './VerificationEvidence'

const ev = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ kind: 'parallel_text', source: 'בר-אילן', ref: `פרק ${i + 1}`, page: '12', snippet: `ראיה מספר ${i + 1}`, supports: 'fix', score: 0.9, ...over }))

describe('VerificationEvidence', () => {
  it('בלי החלטה של שירות הבדיקה — לא מוצג כלום', () => {
    const { container } = render(<VerificationEvidence verification={{ status: 'queued' }} />)
    expect(container).toBeEmptyDOMElement()
    const none = render(<VerificationEvidence verification={null} />)
    expect(none.container).toBeEmptyDOMElement()
  })

  it('מציג החלטה, סיבה, נימוק בעברית וראיות עם סוג ותמיכה', () => {
    render(<VerificationEvidence verification={{ decision: 'approved', reasonCode: 'ok', message: 'שני עדים מראים את התיקון', evidence: ev(2) }} />)
    expect(screen.getByText('השירות המליץ לאשר')).toBeInTheDocument()
    expect(screen.getByText('סיבה: תקין')).toBeInTheDocument()
    expect(screen.getByText('שני עדים מראים את התיקון')).toBeInTheDocument()
    expect(screen.getAllByText('טקסט מקביל')).toHaveLength(2)
    expect(screen.getAllByText('תומך בתיקון')).toHaveLength(2)
    expect(screen.getByText('ראיה מספר 1')).toBeInTheDocument()
    expect(screen.getAllByText('ציון 0.90')).toHaveLength(2)
    expect(screen.queryByText(/הצגת כל הראיות/)).toBeNull()
  })

  it('ראיות רבות — הראשונות גלויות והשאר מאחורי "הצגת כל הראיות"; קוד סיבה לא מוכר מוצג כמו שהוא', () => {
    render(<VerificationEvidence verification={{ decision: 'needs_review', reasonCode: 'svc_partial_evidence', message: '', evidence: ev(7, { supports: 'original' }) }} />)
    expect(screen.getByText('סיבה: svc_partial_evidence')).toBeInTheDocument()
    expect(screen.getByText('הצגת כל הראיות (עוד 3)')).toBeInTheDocument()
    expect(screen.getAllByText('תומך בנוסח הקיים')).toHaveLength(7)
  })

  it('הערות על דרך האיתור: תגיות ושם קובץ', () => {
    render(<VerificationEvidence verification={{ decision: 'rejected', reasonCode: 'content_wrong' }} source={{ matchBasis: 'tags', pathMatch: 'name_fallback' }} />)
    expect(screen.getByText(/בלי התגיות/)).toBeInTheDocument()
    expect(screen.getByText(/לפי שם הספר או שם הקובץ/)).toBeInTheDocument()
    expect(screen.getByText('השירות המליץ לדחות')).toBeInTheDocument()
  })

  it('טקסט מהשירות מוצג כטקסט, לא כ-HTML', () => {
    const { container } = render(<VerificationEvidence verification={{ decision: 'approved', reasonCode: 'ok', message: '<img src=x onerror=alert(1)>', evidence: [{ kind: 'llm', snippet: '<b>מודגש</b>' }] }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>מודגש</b>')).toBeInTheDocument()
  })
})
