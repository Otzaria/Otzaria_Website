import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { categories, faqs } from '@/lib/faq-data'
import FaqList from './FaqList'
import { faqAnswerText } from './faqContent'

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
      expect(item.querySelector('summary + div').textContent).toBe(faqAnswerText(faq))
      expect(item.querySelector('summary + div').textContent).not.toContain('{link}')
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

  it('תשובות ההתקנה: קישור פנימי לדף ההורדה בתוך התשובה, בעיצוב קישור ועם טבעת פוקוס', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    for (const id of [3, 7, 8, 9, 10, 11]) {
      const links = container.querySelectorAll(`#faq-${id} summary + div a`)
      expect(links).toHaveLength(1)
      const link = links[0]
      expect(link.getAttribute('href')).toBe('/#download')
      expect(link.textContent).toMatch(/דף ההורדה$/)
      expect(link.className).toContain('underline')
      expect(link.className).toContain('focus-visible:outline-focus-ring')
    }
  })

  it('קישור בתשובה נגיש לפי שמו כשהשאלה פתוחה, והמונחים הלועזיים שסביבו עדיין מבודדים', () => {
    window.history.replaceState(null, '', '/faq#faq-11')
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    const answer = container.querySelector('#faq-11 summary + div')
    expect(within(answer).getByRole('link', { name: 'בדף ההורדה' })).toHaveAttribute('href', '/#download')
    const isolated = [...answer.querySelectorAll('bdi[dir="ltr"]')].map((b) => b.textContent)
    // גרסה עם מספרה — יחידה אחת; הסוגריים והפיסוק נשארים בטקסט העברי (אחרת הם מתהפכים)
    expect(isolated).toEqual(expect.arrayContaining(['macOS 12', 'Monterey', 'macOS 11', 'macOS', 'Apple']))
    for (const term of isolated) expect(term).toMatch(/^[A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9]$/)
    expect(answer.textContent).toContain('macOS 12 (Monterey)')
  })

  it('שאלה בלי קישור — בלי a בתשובה', () => {
    const { container } = render(<FaqList categories={categories} faqs={faqs} />)
    expect(container.querySelector('#faq-1 summary + div a')).toBeNull()
  })
})
