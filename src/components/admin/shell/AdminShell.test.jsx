// מעטפת הניהול: סרגל לפי תפקיד, "ממתין לטיפולך" (רק כשיש), aria-current בדפי משנה,
// טקסט נגיש למונים, ומגירת הטלפון (פתיחה, Esc שמחזיר פוקוס, סגירה בניווט ובמעבר עמוד).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let session = null
let pathname = '/library/admin'
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: session }), signOut: vi.fn() }))
// כותרת האתר (המעטפת מרנדרת אותה): בלי בקשת מונה ההודעות ובלי next/image
vi.mock('@/lib/api-utils', () => ({ apiGet: vi.fn().mockResolvedValue({ success: true, count: 0 }) }))
vi.mock('next/image', () => ({ default: ({ alt }) => <span role="img" aria-label={alt} /> }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, onClick, children, ...rest }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e) }}>{children}</a>
  ),
}))

import AdminShell from './AdminShell'

const NONE = { unreadMessages: 0, pendingUploads: 0, pendingPlugins: 0 }
const SOME = { unreadMessages: 3, pendingUploads: 11, pendingPlugins: 2 }

function renderShell(props = {}) {
  return render(
    <AdminShell viewer={{ role: 'admin' }} initialCounts={NONE} canBackup={false} {...props}>
      <p>תוכן העמוד</p>
    </AdminShell>
  )
}

// הסרגל במחשב (ב-jsdom אין media queries — גם הסרגל וגם הכפתור קיימים ב-DOM)
const sidebar = () => within(document.querySelector('aside'))

beforeEach(() => {
  session = null
  pathname = '/library/admin'
  // jsdom בלי matchMedia — המגירה מאזינה להרחבה לרוחב מחשב
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AdminShell — הסרגל', () => {
  test('התוכן; בלי h1 של המעטפת, ובלי שם התפקיד בסרגל', () => {
    renderShell()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(sidebar().queryByText('מנהל כללי')).toBeNull()
    expect(screen.getByText('תוכן העמוד').closest('main')).toHaveAttribute('id', 'main-content')
  })

  test('ניווט עם aria-label, וקבוצות עם כותרת (פרט לקבוצה של פריט אחד)', () => {
    renderShell()
    const nav = sidebar().getByRole('navigation', { name: 'ניווט הניהול' })
    for (const label of ['ספרים', 'אימון מודלים', 'תוספים', 'אנשים', 'מערכת']) {
      expect(within(nav).getByRole('list', { name: label })).toBeInTheDocument()
    }
    // "תוספים" — ארבעה פריטים באותו עמוד, כל אחד בתצוגה משלו (?view=)
    const plugins = within(within(nav).getByRole('list', { name: 'תוספים' }))
    expect(plugins.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/library/admin/plugins', '/library/admin/plugins?view=store', '/library/admin/plugins?view=layout', '/library/admin/plugins?view=service',
    ])
  })

  test('בלי מונים — אין "ממתין לטיפולך"', () => {
    renderShell()
    expect(screen.queryByText('ממתין לטיפולך')).toBeNull()
  })

  test('עם מונים — "ממתין לטיפולך" אחרי הלוח, והפריטים נשארים גם במקומם', () => {
    renderShell({ initialCounts: SOME })
    const nav = sidebar().getByRole('navigation')
    const attention = within(nav).getByRole('list', { name: 'ממתין לטיפולך' })
    const links = within(attention).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/library/admin/messages', '/library/admin/uploads?status=not_checked&sort=oldest', '/library/admin/plugins'])
    expect(links[0]).toHaveAccessibleName('הודעות שלא נקראו, 3')
    // הסדר ב-DOM: לוח ← ממתין לטיפולך ← הקבוצות
    const dashboard = within(nav).getByRole('link', { name: 'לוח' })
    expect(dashboard.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // הפריט הרגיל עם המונה כתג (לא "העלאות (11)")
    const people = within(nav).getByRole('list', { name: 'אנשים' })
    expect(within(people).getByRole('link', { name: /הודעות/ })).toHaveTextContent('3, 3 הודעות שלא נקראו')
    expect(screen.queryByText('העלאות (11)')).toBeNull()
  })

  test('מנהל OCR לא רואה "ממתין לטיפולך" גם אם יש מונים', () => {
    renderShell({ viewer: { role: 'admin_ocr' }, initialCounts: SOME })
    expect(screen.queryByText('ממתין לטיפולך')).toBeNull()
    expect(sidebar().queryByRole('link', { name: /הודעות/ })).toBeNull()
  })

  test('aria-current בדפי משנה: אשפה → העלאות', () => {
    pathname = '/library/admin/trash'
    renderShell({ initialCounts: SOME })
    const current = sidebar().getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/library/admin/uploads')
  })

  test('דיווחי טעויות: קישור רגיל (בלי סימון "מחוץ לפאנל"), ופעיל בכל עמודי התיקונים', () => {
    for (const path of ['/library/corrections', '/library/corrections/66aa11', '/library/corrections/admin']) {
      pathname = path
      const { unmount } = renderShell()
      const link = sidebar().getByRole('link', { name: 'דיווחי טעויות' })
      expect(link).toHaveAttribute('href', '/library/corrections')
      expect(link).not.toHaveAttribute('title')
      expect(link).toHaveAttribute('aria-current', 'page')
      expect(sidebar().getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(1)
      unmount()
    }
  })

  test('בלי כותרת במעטפת: אין h1 (ה-h1 הוא של המסך); "ניהול" בשקט בראש הסרגל, ו"חזרה לאזור האישי" בתחתיתו', () => {
    renderShell()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const aside = document.querySelector('aside')
    expect(aside.textContent.startsWith('ניהול')).toBe(true)
    expect(aside.textContent.trim().endsWith('חזרה לאזור האישי')).toBe(true)
  })

  test('מתנדב תיקונים (משתמש רגיל): רק "דיווחי טעויות" וחזרה לאזור האישי, בלי בקשת מונים', () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    pathname = '/library/corrections'
    renderShell({ viewer: { role: 'user', isCorrectionsVolunteer: true } })
    const links = sidebar().getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/library/corrections', '/library/dashboard'])
    expect(sidebar().queryByRole('link', { name: 'לוח' })).toBeNull()
    expect(screen.queryByText('ממתין לטיפולך')).toBeNull()
    vi.advanceTimersByTime(5 * 60_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('מפקח (משתמש רגיל): רק "הצעות עריכה" וחזרה לאזור האישי, בלי לוח ובלי בקשת מונים', () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    pathname = '/library/dicta-edit/moderation'
    renderShell({ viewer: { role: 'user', isSupervisor: true } })
    const links = sidebar().getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/library/dicta-edit/moderation', '/library/dashboard'])
    expect(sidebar().getByRole('link', { name: 'הצעות עריכה' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^ניהול/ })).toBeInTheDocument()
    vi.advanceTimersByTime(5 * 60_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('צופה בלי אף פריט (משתמש רגיל): בלי סרגל ובלי תפריט — רק הכותרת והתוכן', () => {
    for (const viewer of [{ role: 'user' }, { role: 'user', isCorrectionsVolunteer: false, isSupervisor: false }]) {
      const { unmount } = renderShell({ viewer })
      expect(document.querySelector('aside')).toBeNull()
      expect(screen.queryByRole('button', { name: /^ניהול/ })).toBeNull()
      // הקישורים היחידים — של כותרת האתר; בתוכן אין ניווט ניהול
      expect(within(screen.getByRole('main')).queryByRole('link')).toBeNull()
      expect(screen.queryByRole('navigation', { name: 'ניווט הניהול' })).toBeNull()
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
      expect(screen.getByText('תוכן העמוד')).toBeInTheDocument()
      unmount()
    }
  })

  test('הדגל מגיע גם מ-useSession (עדכון בצד הלקוח)', () => {
    session = { user: { role: 'admin_ocr', isCorrectionsVolunteer: true } }
    renderShell({ viewer: { role: 'admin_ocr' } })
    expect(sidebar().getByRole('link', { name: 'דיווחי טעויות' })).toBeInTheDocument()
    expect(sidebar().getByRole('link', { name: 'תמלול שורות' })).toBeInTheDocument()
  })

  test('הורד גיבוי רק כש-canBackup; חזרה לאזור האישי תמיד', () => {
    const { unmount } = renderShell()
    expect(sidebar().queryByRole('button', { name: /גיבוי/ })).toBeNull()
    expect(sidebar().getByRole('link', { name: 'חזרה לאזור האישי' })).toHaveAttribute('href', '/library/dashboard')
    unmount()
    renderShell({ canBackup: true })
    // הכפתור פותח דיאלוג; ההורדה עצמה (אותה כתובת) — ב-BackupAction.test.jsx
    expect(sidebar().getByRole('button', { name: 'הורד גיבוי' })).toBeInTheDocument()
  })

  test('מפתח: פריט אחד, בלי כותרת קבוצה', () => {
    renderShell({ viewer: { role: 'developer' } })
    const nav = sidebar().getByRole('navigation')
    expect(within(nav).getAllByRole('link')).toHaveLength(1)
    expect(within(nav).queryAllByRole('list', { name: /./ })).toHaveLength(0)
  })
})

describe('AdminShell — השמות לפי מילון השמות', () => {
  // השמות הישנים של המעטפת. נבדק בטקסט הגלוי, בשמות הנגישים (aria-label/sr-only) ובמגירה.
  const OLD_NAMES = /פאנל ניהול|דשבורד|דורש טיפול|תפריט ניהול|גיבוי מלא|תוספים ממתינים/

  test('אין "פאנל ניהול", "דשבורד" ושאר השמות הישנים — לא בסרגל, לא בכפתור ולא במגירה', async () => {
    const user = userEvent.setup()
    const { container } = renderShell({ initialCounts: SOME, canBackup: true })
    expect(container.textContent).not.toMatch(OLD_NAMES)
    for (const el of container.querySelectorAll('[aria-label]')) expect(el.getAttribute('aria-label')).not.toMatch(OLD_NAMES)
    expect(within(screen.getByRole('button', { name: /^ניהול/ })).getByText('ניהול')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^ניהול/ }))
    const dialog = screen.getByRole('dialog', { name: 'ניהול' })
    expect(dialog.textContent).not.toMatch(OLD_NAMES)
  })

  test('השמות החדשים: כותרת, לוח, ממתין לטיפולך, הורד גיבוי', () => {
    renderShell({ initialCounts: SOME, canBackup: true })
    expect(sidebar().getByText('ניהול')).toBeInTheDocument()
    expect(sidebar().getByRole('link', { name: 'לוח' })).toHaveAttribute('href', '/library/admin')
    expect(sidebar().getByRole('list', { name: 'ממתין לטיפולך' })).toBeInTheDocument()
    expect(sidebar().getByRole('link', { name: 'תוספים לאישור, 2' })).toHaveAttribute('href', '/library/admin/plugins')
    expect(sidebar().getByRole('button', { name: 'הורד גיבוי' })).toBeInTheDocument()
  })
})

describe('AdminShell — מגירת הטלפון', () => {
  const menuButton = () => screen.getByRole('button', { name: /^ניהול/ })

  test('כפתור "ניהול" בשורה העליונה (בכותרת האתר), ליד כפתור התפריט של האתר — ולא בשורה משלו מעל העמוד', () => {
    renderShell({ initialCounts: SOME })
    const banner = screen.getByRole('banner')
    expect(banner).toContainElement(menuButton())
    // שני כפתורים שונים: "ניהול" (המגירה) ו"תפריט" (ניווט האתר), זה ליד זה
    const siteMenu = within(banner).getByRole('button', { name: 'תפריט' })
    expect(menuButton().parentElement).toBe(siteMenu.parentElement)
    expect(menuButton()).toHaveTextContent('ניהול')
    expect(menuButton()).not.toHaveTextContent('תפריט')
    expect(screen.getByRole('main')).not.toContainElement(menuButton())
  })

  test('בכותרת שבעמודי הניהול שורת הניווט של האתר מתקפלת לתפריט מתחת ל-xl (ולא רק מתחת ל-md)', () => {
    renderShell()
    const siteNav = within(screen.getByRole('banner')).getByRole('navigation', { name: 'ניווט הספרייה', hidden: true })
    expect(siteNav.className).toContain('xl:flex')
    expect(siteNav.className).not.toContain('md:flex')
  })

  test('הכפתור מציג את מספר ההודעות שלא נקראו בלבד, עם פירוט נגיש מלא', () => {
    renderShell({ initialCounts: SOME })
    expect(menuButton()).toHaveAccessibleName('ניהול, ממתין לטיפולך: 3 הודעות שלא נקראו, 11 העלאות שלא נבדקו, 2 תוספים לאישור')
    expect(menuButton()).toHaveTextContent('3')
    expect(menuButton()).not.toHaveTextContent('16')
  })

  test('בלי הודעות שלא נקראו אבל עם ממתינים אחרים — נקודה בלי מספר', () => {
    renderShell({ initialCounts: { ...SOME, unreadMessages: 0 } })
    expect(menuButton()).toHaveAccessibleName('ניהול, ממתין לטיפולך: 11 העלאות שלא נבדקו, 2 תוספים לאישור')
    // הסימון הגלוי (aria-hidden) הוא נקודה ריקה; הפירוט עם המספרים רק לקוראי מסך
    const marks = [...menuButton().querySelectorAll('[aria-hidden="true"]')].filter((el) => el.classList.contains('bg-error'))
    expect(marks).toHaveLength(1)
    expect(marks[0]).toBeEmptyDOMElement()
  })

  test('בלי מונים — בלי מספר על הכפתור', () => {
    renderShell()
    expect(menuButton()).not.toHaveTextContent(/\d/)
  })

  test('פתיחה, Esc סוגר ומחזיר פוקוס לכפתור', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    await user.click(menuButton())
    const dialog = screen.getByRole('dialog', { name: 'ניהול' })
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(dialog).toContainElement(document.activeElement)
    expect(within(dialog).getByRole('navigation', { name: 'ניווט הניהול' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(menuButton()).toHaveFocus()
  })

  test('בזמן שהמגירה פתוחה שאר הדף inert, ובסגירה משתחרר והפוקוס חוזר', async () => {
    const user = userEvent.setup()
    const announcer = document.body.appendChild(document.createElement('next-route-announcer'))
    const { container } = renderShell()
    await user.click(menuButton())
    const dialog = screen.getByRole('dialog')
    expect(container).toHaveAttribute('inert')
    expect(dialog.closest('[inert]')).toBeNull()
    // מכריז המעבר של Next נשאר נגיש
    expect(announcer).not.toHaveAttribute('inert')
    announcer.remove()
    await user.keyboard('{Escape}')
    expect(container).not.toHaveAttribute('inert')
    expect(menuButton()).toHaveFocus()
  })

  test('הרחבת החלון לרוחב xl (שם הסרגל גלוי) סוגרת את המגירה', async () => {
    let onChange = null
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: (_, fn) => { onChange = fn }, removeEventListener: vi.fn() }))
    const user = userEvent.setup()
    renderShell()
    await user.click(menuButton())
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 80rem)')
    act(() => onChange({ matches: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('לחיצה על קישור במגירה סוגרת אותה', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(menuButton())
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'ספרים' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('מתנדב תיקונים בטלפון: המגירה מציגה את אותו סרגל מצומצם', async () => {
    const user = userEvent.setup()
    pathname = '/library/corrections/66aa11'
    renderShell({ viewer: { role: 'user', isCorrectionsVolunteer: true } })
    await user.click(menuButton())
    const drawer = within(screen.getByRole('dialog', { name: 'ניהול' }))
    expect(screen.getByRole('dialog', { name: 'ניהול' })).not.toHaveTextContent('מתנדב תיקונים')
    expect(drawer.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/library/corrections', '/library/dashboard'])
    expect(drawer.getByRole('link', { name: 'דיווחי טעויות' })).toHaveAttribute('aria-current', 'page')
    expect(drawer.getByRole('link', { name: 'חזרה לאזור האישי' })).not.toHaveAttribute('aria-current')
  })

  test('מעבר עמוד (שינוי כתובת) סוגר את המגירה', async () => {
    const user = userEvent.setup()
    const { rerender } = renderShell()
    await user.click(menuButton())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    pathname = '/library/admin/books'
    act(() => {
      rerender(
        <AdminShell viewer={{ role: 'admin' }} initialCounts={NONE} canBackup={false}>
          <p>תוכן העמוד</p>
        </AdminShell>
      )
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
