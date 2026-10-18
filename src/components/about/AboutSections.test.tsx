import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AboutHero from './AboutHero'
import AboutLinkCard from './AboutLinkCard'
import JoinCallout from './JoinCallout'
import LibraryCollectionSection, { LIBRARY_SECTIONS } from './LibraryCollectionSection'
import LicenseTermsSection from './LicenseTermsSection'
import MoreSourcesCard, { MORE_SOURCES } from './MoreSourcesCard'
import SourceQuote from './SourceQuote'
import SourcesSection from './SourcesSection'

// next/image דורש את צנרת התמונות של Next — כאן <img> רגיל עם אותם מאפיינים
vi.mock('next/image', () => ({
  // eslint-disable-next-line jsx-a11y/alt-text
  default: ({ fetchPriority, ...props }: Record<string, unknown>) => <img {...props} data-fetch-priority={fetchPriority as string} />
}))

describe('AboutHero', () => {
  it('h1 אחד עם הקישוט, שורת המשנה, והאזור נקרא בשם הכותרת', () => {
    const { container } = render(<AboutHero />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'אודות ספריית אוצריא' })).toBeInTheDocument()
    expect(screen.getByText('פלטפורמה משותפת לעריכה ושיתוף של ספרי קודש')).toBeInTheDocument()
    expect(container.querySelector('.title-ornament')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('font-display')
  })

  it('הלוגו דקורטיבי (alt ריק), נטען מיד ובעדיפות גבוהה (אלמנט ה-LCP)', () => {
    const { container } = render(<AboutHero />)
    const logo = container.querySelector('img') as HTMLImageElement
    expect(logo).toHaveAttribute('alt', '')
    expect(logo).toHaveAttribute('loading', 'eager')
    expect(logo).toHaveAttribute('data-fetch-priority', 'high')
  })
})

describe('LibraryCollectionSection', () => {
  it('h2, היקף הספרייה, וכל התחומים ברשימה לפי הסדר', () => {
    render(<LibraryCollectionSection />)
    const region = screen.getByRole('region', { name: 'ספריית אוצריא' })
    expect(within(region).getByText('הספרייה מונה אלפי ספרים, ובהם רוב ספרי היסוד:')).toBeInTheDocument()
    expect(region.textContent).not.toMatch(/\d,\d{3}/)
    const items = within(region).getAllByRole('listitem').map((li) => li.querySelector(':scope > span:not([aria-hidden])')?.textContent)
    expect(items).toEqual(LIBRARY_SECTIONS)
  })
})

describe('MoreSourcesCard', () => {
  it('h3, וכל קישור חיצוני בחלון חדש עם רמז לקוראי מסך וטבעת פוקוס', () => {
    render(<MoreSourcesCard />)
    expect(screen.getByRole('heading', { level: 3, name: 'מקורות נוספים:' })).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(MORE_SOURCES.map((s) => s.href))
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link.className).toContain('focus-visible:outline')
      expect(link.className).toContain('min-h-(--touch-target)')
      expect(link.querySelector('.sr-only')).toHaveTextContent('(נפתח בחלון חדש)')
    }
  })
})

describe('SourcesSection', () => {
  it('ארבעה כרטיסים (h3) באותו סדר: ספריא, דיקטה, מקורות נוספים, OCR', () => {
    render(<SourcesSection />)
    const region = screen.getByRole('region', { name: 'מקורות הספרים' })
    const titles = within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['ספריא (Sefaria)', 'דיקטה', 'מקורות נוספים:', 'פרויקט OCR + AI'])
  })
})

describe('AboutLinkCard', () => {
  it('כל הכרטיס קישור, עם חץ "הלאה" שמאלה (RTL) שמכובד ב-reduced-motion', () => {
    render(<AboutLinkCard href="/license" icon="description">לרישיון</AboutLinkCard>)
    const link = screen.getByRole('link', { name: 'לרישיון' })
    expect(link).toHaveAttribute('href', '/license')
    expect(link.className).toContain('focus-visible:outline')
    const arrow = Array.from(link.querySelectorAll('[aria-hidden="true"]')).find((el) => el.textContent === 'chevron_left')
    expect(arrow?.getAttribute('class')).toContain('motion-reduce:transition-none')
  })
})

describe('LicenseTermsSection', () => {
  it('הערה (role=note) ושני קישורי הרישיון', () => {
    render(<LicenseTermsSection />)
    const region = screen.getByRole('region', { name: 'תנאי השימוש במאגר' })
    expect(within(region).getByRole('note')).toHaveTextContent('ניתן לראות את פרטי הרישיון לכל טקסט באתר ספריא')
    expect(within(region).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/license', '/library/license'])
    expect(within(region).getByRole('link', { name: 'לרישיון התוכנה' })).toHaveAttribute('href', '/license')
  })
})

describe('SourceQuote', () => {
  it('figure עם blockquote, קישוט דקורטיבי, ומקור ב-figcaption — בלי כותרת ובלי landmark בעל שם', () => {
    const { container } = render(<SourceQuote quote="ציטוט" explanation="הסבר" source="(מקור)" />)
    const figure = container.querySelector('figure')
    expect(figure?.querySelector('blockquote')).toHaveTextContent('ציטוט')
    expect(figure?.querySelector('figcaption')).toHaveTextContent('(מקור)')
    expect(figure?.querySelector('.title-ornament')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(container.querySelector('section')).not.toHaveAttribute('aria-labelledby')
    expect(screen.queryByRole('region')).toBeNull()
  })
})

describe('JoinCallout', () => {
  it('h2 ביחיד, הסבר קצר, וכפתור "עזור לספרייה" אל /library', () => {
    render(<JoinCallout />)
    expect(screen.getByRole('heading', { level: 2, name: 'רוצה לקחת חלק?' })).toBeInTheDocument()
    expect(screen.getByText(/יש כמה דרכים לסייע: העלאת ספרים, הגהת עמודים, הוספת מידע ועוד\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'עזור לספרייה' })).toHaveAttribute('href', '/library')
  })
})
