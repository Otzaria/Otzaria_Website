import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import {
  ADDITIONAL_SOURCES,
  COMPANY_MAILTO,
  DEVELOPERS,
  EDITOR_GROUPS,
  EMERGENCY_LINES,
  MEMORIAL_MAILTO,
  MEMORIALS,
  PAGE_SECTIONS,
  SLOT_EMAIL,
  SPONSOR_COMPANIES,
  SUPPORT_ORGS
} from '@/lib/chachmei-lev-data'
import { CONTACT_EMAIL } from '@/components/notFound/notFoundLinkData'
import AidSection from './AidSection'
import ChachmeiLevHero from './ChachmeiLevHero'
import CompaniesSection from './CompaniesSection'
import ContributorsSection from './ContributorsSection'
import DevelopersSection from './DevelopersSection'
import LibrarySection from './LibrarySection'
import MemorialSection from './MemorialSection'
import PersonChip from './PersonChip'
import SourceCard from './SourceCard'
import SupportOrgCard from './SupportOrgCard'
import ZayitCredit from './ZayitCredit'

// next/image דורש את צנרת התמונות של Next — כאן <img> רגיל עם אותם מאפיינים
vi.mock('next/image', () => ({
  // eslint-disable-next-line jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />
}))

describe('ChachmeiLevHero', () => {
  it('h1 "חכמי לב", הציטוט עם מקורותיו, וניווט מהיר לכל האזורים', () => {
    render(<ChachmeiLevHero />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('חכמי לב')
    expect(screen.getByText('וְצִדְקָתוֹ עֹמֶדֶת לָעַד')).toBeInTheDocument()
    expect(screen.getByText('(כתובות נ.)')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'ניווט מהיר בדף' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(PAGE_SECTIONS.map((s) => `#${s.id}`))
  })
})

describe('MemorialSection', () => {
  it('ההקדשות בנוסח המדויק, ומשבצת פנויה ששולחת מייל להנצחה', () => {
    const { container } = render(<MemorialSection />)
    const region = screen.getByRole('region', { name: 'לוח הנצחה' })
    for (const memorial of MEMORIALS) {
      expect(within(region).getByRole('heading', { level: 3, name: memorial.title })).toBeInTheDocument()
    }
    const slot = within(region).getByRole('link', { name: /מקום זה יכול להיות מונצח לע"נ יקירך/ })
    expect(slot.getAttribute('href')).toBe(MEMORIAL_MAILTO)
    expect(MEMORIAL_MAILTO).toMatch(/^mailto:otzaria\.1@gmail\.com\?subject=/)
    expect(slot).toHaveTextContent('שלח מייל')
    expect(slot).not.toHaveTextContent('@')
    // הנר דקורטיבי
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))
  })

  it('המשבצת הפנויה — בסגנון כפתור התרומה של האתר, ולמייל הקשר של האתר', () => {
    render(<MemorialSection />)
    const slot = screen.getByRole('link', { name: /מקום זה יכול להיות מונצח/ })
    expect(slot.querySelector('.donation-button')).not.toBeNull()
    expect(SLOT_EMAIL).toBe(CONTACT_EMAIL)
  })
})

describe('CompaniesSection', () => {
  it('כל חברה קישור חיצוני בטוח עם שמה, ובסוף משבצת "מקום זה יכול להיות שלך" ששולחת מייל', () => {
    render(<CompaniesSection />)
    const region = screen.getByRole('region', { name: 'חברות שתרמו' })
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(SPONSOR_COMPANIES.length + 1)
    const kesher = within(region).getByRole('link', { name: /קשר פתרונות תקשורת/ })
    expect(kesher).toHaveAttribute('href', 'https://קשר.ישראל/')
    expect(kesher).toHaveAttribute('target', '_blank')
    expect(kesher).toHaveAttribute('rel', 'noopener noreferrer')
    expect(kesher).toHaveTextContent('(נפתח בחלון חדש)')
    expect(kesher.querySelector('img')).toHaveAttribute('alt', '')
    expect(within(items.at(-1) as HTMLElement).getByRole('link').getAttribute('href')).toBe(COMPANY_MAILTO)
    expect(items.at(-1)).toHaveTextContent('מקום זה יכול להיות שלך')
  })
})

describe('AidSection', () => {
  it('מקפל עם הכותרת מהתוכנה, וכל קווי החירום וארגוני הסיוע בתוכו', () => {
    const { container } = render(<AidSection />)
    expect(screen.getByRole('region', { name: 'סיוע ללומדי תורה' })).toBeInTheDocument()
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')).toHaveTextContent('אוצריא מתגייסת לעזרת לומדי התורה')
    for (const org of [...EMERGENCY_LINES, ...SUPPORT_ORGS]) {
      expect(screen.getByRole('heading', { level: 4, name: org.name, hidden: true })).toBeInTheDocument()
    }
  })
})

describe('SupportOrgCard', () => {
  it('טלפון לחיוג, כמות נרשמים מעוצבת, והדגשות בלי כוכביות', () => {
    const org = { name: 'קו', phone: '073-888-1234', logo: '/x.png', registeredCount: 1234, details: ['**חשוב**', '', '7 - (מעל {registered})'] }
    render(<ul><SupportOrgCard org={org} emergency /></ul>)
    const tel = screen.getByRole('link', { name: /073-888-1234/ })
    expect(tel).toHaveAttribute('href', 'tel:0738881234')
    expect(tel).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('חשוב').tagName).toBe('STRONG')
    expect(screen.getByText('7 - (מעל 1,234)')).toBeInTheDocument()
    expect(screen.queryByText(/\*\*/)).toBeNull()
  })
})

describe('PersonChip', () => {
  it('עם קישור — שבב-קישור חיצוני בטוח עם רמז לקורא המסך, והתיאור בשורה שנייה מתחת לשם; בלי אייקון', () => {
    render(<PersonChip twoLine person={{ name: 'sivan22', url: 'https://github.com/Sivan22', description: 'תיאור' }} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('sivan22')
    expect(link).toHaveTextContent('(נפתח בחלון חדש)')
    const description = screen.getByText('תיאור')
    expect(description).toHaveAttribute('title', 'תיאור')
    expect(description.className).toMatch(/line-clamp-2/)
    expect(link.querySelector('.material-symbols-outlined')).toBeNull()
  })

  it('בלי קישור — אותו שבב מעוגל עם מסגרת (לא שם שטוח); twoLine — אותו גובה קבוע לכולם', () => {
    const { rerender } = render(<PersonChip twoLine person={{ name: 'דוד אריאל' }} />)
    expect(screen.queryByRole('link')).toBeNull()
    const flat = screen.getByText('דוד אריאל').parentElement as HTMLElement
    expect(flat.className).toMatch(/border/)
    expect(flat.className).toMatch(/h-\[4\.25rem\]/)
    rerender(<PersonChip twoLine person={{ name: 'ר. נבון', url: 'https://github.com/x', description: 'השקעה' }} />)
    expect(screen.getByRole('link').className).toMatch(/h-\[4\.25rem\]/)
  })
})

describe('SourceCard', () => {
  it('כל לוגו כמסכה בצבע הטקסט (לא img); בלי לוגו — השם בלבד; בלי קישור — לא קישור', () => {
    const { container, rerender } = render(<ul><SourceCard source={{ name: 'א', url: 'https://a.org', logo: '/a.svg', ratio: 2 }} /></ul>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://a.org')
    expect((container.querySelector('[style*="mask-image"]') as HTMLElement).style.maskImage).toContain('/a.svg')
    rerender(<ul><SourceCard source={{ name: 'ב', url: 'https://b.org', logo: '/b.png', ratio: 1 }} /></ul>)
    expect(container.querySelector('img')).toBeNull()
    expect((container.querySelector('[style*="mask-image"]') as HTMLElement).style.maskImage).toContain('/b.png')
    rerender(<ul><SourceCard source={{ name: 'ד', url: 'https://d.org' }} /></ul>)
    expect(container.querySelector('[style*="mask-image"]')).toBeNull()
    expect(screen.getByRole('link')).toHaveTextContent('ד')
    rerender(<ul><SourceCard source={{ name: 'ג' }} /></ul>)
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('אזורי האנשים והספרייה', () => {
  it('תרמו מהונם ומזמנם, המפתחים — בלי שורת המשוב/הפורום של התוכנה', () => {
    render(<><ContributorsSection /><DevelopersSection /></>)
    expect(screen.getByRole('region', { name: 'תרמו מהונם ומזמנם' })).toHaveTextContent('דוד אריאל')
    const dev = screen.getByRole('region', { name: 'אודות פיתוח התוכנה' })
    expect(within(dev).getAllByRole('link')).toHaveLength(DEVELOPERS.length)
    expect(dev).not.toHaveTextContent('פורום')
  })

  it('ספריית אוצריא: כל המקורות, שתי דרגות המהדירים וההערה עם מייל', () => {
    render(<LibrarySection />)
    const region = screen.getByRole('region', { name: 'אודות ספריית אוצריא' })
    // כל מקור פעמיים: שבב לנייד וכרטיס לוגו מ-sm (העותק שאינו מוצג מוסתר ב-CSS)
    for (const source of ADDITIONAL_SOURCES) expect(within(region).getAllByText(source.name)).toHaveLength(2)
    for (const group of EDITOR_GROUPS) expect(within(region).getByText(group.label)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /@gmail\.com/ }).getAttribute('href')).toMatch(/^mailto:/)
  })

  it('קרדיט זית באנגלית, משמאל לימין', () => {
    const { container } = render(<ZayitCredit />)
    const p = container.querySelector('p') as HTMLElement
    expect(p).toHaveAttribute('dir', 'ltr')
    expect(p).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://zayitapp.com/')
    // רמז "נפתח בחלון חדש" בעברית — מסומן כעברית בתוך הפסקה האנגלית
    expect(screen.getByText(/נפתח בחלון חדש/).closest('[lang="he"]')).not.toBeNull()
  })
})
