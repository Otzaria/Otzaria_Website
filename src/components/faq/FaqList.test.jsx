import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { categories, faqs } from '@/lib/faq-data'
import FaqList from './FaqList'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const filter = () => screen.getByRole('group', { name: 'סינון לפי קטגוריה' })
const pressed = () => within(filter()).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')

describe('FaqList', () => {
  it('כפתורי הסינון — כל הקטגוריות, "הכל" נבחר', () => {
    render(<FaqList categories={categories} faqs={faqs} />)
    const buttons = within(filter()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(categories.map((c) => c.label))
    expect(pressed().map((b) => b.textContent)).toEqual(['הכל'])
  })

  it('"הכל": אזור עם כותרת h2 לכל קטגוריה, וכל השאלות והתשובות ב-DOM (גם סגורות)', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2).toEqual(categories.filter((c) => c.id !== 'all').map((c) => c.label))
    expect(screen.getByRole('region', { name: 'חיפוש' })).toBeInTheDocument()
    const details = container.querySelectorAll('details')
    expect(details).toHaveLength(faqs.length)
    for (const faq of faqs) {
      const item = container.querySelector(`#faq-${faq.id}`)
      expect(item.tagName).toBe('DETAILS')
      expect(item.open).toBe(false)
      // השאלה בתוך summary (האייקון — גליף ligature, aria-hidden), והתשובה אחריו
      expect(item.querySelector('summary > span').textContent).toBe(faq.question)
      expect(item.querySelector('summary + div').textContent).toBe(faq.answer)
    }
  })

  it('בחירת קטגוריה מציגה רק אותה', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    fireEvent.click(within(filter()).getByRole('button', { name: 'חיפוש' }))
    expect(pressed().map((b) => b.textContent)).toEqual(['חיפוש'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['חיפוש'])
    expect(container.querySelectorAll('details')).toHaveLength(faqs.filter((f) => f.category === 'search').length)
  })

  it('מונח לועזי מבודד ב-bdi dir=ltr, בלי לשנות את הטקסט', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    const summary = container.querySelector('#faq-4 summary')
    expect(summary.querySelector('bdi[dir="ltr"]').textContent).toBe('Web')
  })

  it('עוגן בכתובת פותח את השאלה — גם כשהקטגוריה שלה מסוננת החוצה', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    fireEvent.click(within(filter()).getByRole('button', { name: 'חיפוש' }))
    expect(container.querySelector('#faq-7')).toBeNull()
    window.history.replaceState(null, '', '/faq#faq-7')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(pressed().map((b) => b.textContent)).toEqual(['הכל'])
    expect(container.querySelector('#faq-7').open).toBe(true)
  })

  it('אחרי פתיחה מעוגן, שינוי סינון לא פותח את השאלה שוב', () => {
    window.history.replaceState(null, '', '/faq#faq-8')
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    const item = container.querySelector('#faq-8')
    expect(item.open).toBe(true)
    item.open = false
    fireEvent.click(within(filter()).getByRole('button', { name: 'התקנה' }))
    expect(container.querySelector('#faq-8').open).toBe(false)
  })

  it('קישור אל העוגן שכבר בכתובת (בלי hashchange) פותח את השאלה', () => {
    window.history.replaceState(null, '', '/faq#faq-3')
    const { container } = render(
      <>
        <a href="/faq#faq-3" onClick={(e) => e.preventDefault()}>קישור</a>
        <FaqList categories={categories} faqs={faqs} />
      </>
    )
    container.querySelector('#faq-3').open = false
    fireEvent.click(screen.getByText('קישור'))
    expect(container.querySelector('#faq-3').open).toBe(true)
  })

  it('עוגן בטעינה פותח את השאלה', () => {
    window.history.replaceState(null, '', '/faq#faq-2')
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    expect(container.querySelector('#faq-2').open).toBe(true)
    expect(container.querySelector('#faq-1').open).toBe(false)
  })
})
