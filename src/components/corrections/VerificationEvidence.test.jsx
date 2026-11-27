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

  describe('הסבר אוטומטי', () => {
    const base = { decision: 'needs_review', reasonCode: 'content_doubtful', message: 'עד אחד בלבד', evidence: ev(1) }
    const expl = { text: 'המילה כתובה כך גם בדפוס אחר.', model: 'qwen3-8b', note: 'הסבר אוטומטי; אינו החלטה ואינו ראיה.' }

    it('מוצג תחת כותרת "הסבר אוטומטי" עם ההערה והמודל', () => {
      render(<VerificationEvidence verification={{ ...base, volunteerExplanation: expl }} />)
      expect(screen.getByRole('heading', { name: 'הסבר אוטומטי' })).toBeInTheDocument()
      expect(screen.getByText('המילה כתובה כך גם בדפוס אחר.')).toHaveAttribute('dir', 'rtl')
      expect(screen.getByText('הסבר אוטומטי; אינו החלטה ואינו ראיה.')).toHaveClass('text-on-surface/50')
      expect(screen.getByText('qwen3-8b')).toBeInTheDocument()
      // שאר הלוח לא נפגע
      expect(screen.getByText('עד אחד בלבד')).toBeInTheDocument()
      expect(screen.getByText('ראיה מספר 1')).toBeInTheDocument()
    })

    it('בלי הסבר, או עם הסבר ריק — לא מוצג כלום', () => {
      for (const v of [undefined, null, {}, { text: '', model: 'm', note: 'n' }, { text: 5 }]) {
        const { unmount } = render(<VerificationEvidence verification={{ ...base, volunteerExplanation: v }} />)
        expect(screen.queryByText('הסבר אוטומטי')).toBeNull()
        unmount()
      }
    })

    it('בלי מודל או בלי הערה — מוצג רק מה שיש; טקסט כטקסט ולא כ-HTML', () => {
      const { container } = render(<VerificationEvidence verification={{ ...base, volunteerExplanation: { text: '<img src=x onerror=alert(1)> הסבר' } }} />)
      expect(container.querySelector('img')).toBeNull()
      expect(screen.getByText('<img src=x onerror=alert(1)> הסבר')).toBeInTheDocument()
      expect(screen.queryByText('qwen3-8b')).toBeNull()
    })
  })
})
