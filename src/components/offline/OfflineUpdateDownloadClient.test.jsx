// בדיקות ל-OfflineUpdateDownloadClient: מספר הגרסה שמגיע כבר טעון (releases prop, נשלף בשרת
// ע"י OfflineUpdateDownload.jsx) מוצג; כש-releases הוא null מוצג מסר הנפילה והקישורים מובילים
// לדף הגרסאות. איזה כרטיס מוצג נקבע ב-CSS לפי <html data-os> (jsdom לא מחשב CSS) — כאן נבדקות
// מחלקות ה-CSS, התג "המחשב שלך" (לפי data-os), והקישור המשני למערכת השנייה.
import { afterEach, describe, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OfflineUpdateDownloadClient from './OfflineUpdateDownloadClient'

const REPO = 'https://github.com/org/repo'
const RELEASES = {
  version: 'v1.2.3',
  publishedAt: '2026-10-11T23:07:00Z',
  windows: { url: 'https://example.com/win.exe', size: 19_640_320 },
  macos: { url: 'https://example.com/mac.zip', size: 48_603_042 }
}

const setOs = (os) => document.documentElement.setAttribute('data-os', os)
const block = (container, key) => container.querySelector(`[data-offline-platform="${key}"]`)

afterEach(() => document.documentElement.removeAttribute('data-os'))

describe('OfflineUpdateDownloadClient', () => {
  test('מציג את מספר הגרסה ואת הקישורים הישירים לקבצים', () => {
    render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)

    expect(screen.getByText('v1.2.3')).toBeInTheDocument()
    const windows = screen.getByRole('link', { name: 'הורד ל-Windows' })
    expect(windows).toHaveAttribute('href', RELEASES.windows.url)
    expect(windows).toHaveAccessibleDescription(/18\.7 MB/)
    expect(screen.getByRole('link', { name: 'הורד ל-macOS' })).toHaveAttribute('href', RELEASES.macos.url)
  })

  test('מסר נפילה כש-releases הוא null, וכל הקישורים מובילים לדף הגרסה האחרונה', () => {
    render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={null} />)

    expect(screen.getByText(/לא הצלחנו לטעון את פרטי הגרסה/)).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: /^(הורד ל-|להורדה ל-)/ })) {
      expect(link).toHaveAttribute('href', `${REPO}/releases/latest`)
    }
  })

  test('ב-CSS: Windows מוצג תמיד חוץ מב-Mac, ו-macOS רק ב-Mac', () => {
    const { container } = render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)

    expect(block(container, 'windows').className).toMatch(/(^|\s)flex(\s|$)/)
    expect(block(container, 'windows')).toHaveClass('in-data-[os=macos]:hidden')
    expect(block(container, 'macos')).toHaveClass('hidden', 'in-data-[os=macos]:flex')
    const [mobileNote, otherNote] = screen.getAllByRole('note', { hidden: true })
    expect(mobileNote).toHaveClass('hidden', 'in-data-[os=mobile]:flex')
    expect(mobileNote).toHaveTextContent(/מיועד למחשב/)
    expect(otherNote).toHaveClass('hidden', 'in-data-[os=other]:flex')
  })

  test('מתחת לכל כרטיס — קישור משני להורדה למערכת השנייה', () => {
    const { container } = render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)

    const underWindows = within(block(container, 'windows'))
    expect(underWindows.getByText(/יש לך/)).toHaveTextContent('יש לך Mac? להורדה ל-macOS')
    expect(underWindows.getByRole('link', { name: 'להורדה ל-macOS' })).toHaveAttribute('href', RELEASES.macos.url)
    const underMac = within(block(container, 'macos'))
    expect(underMac.getByRole('link', { name: 'להורדה ל-Windows' })).toHaveAttribute('href', RELEASES.windows.url)
  })

  test('Mac שזוהה — התג "המחשב שלך" על כרטיס macOS בלבד', () => {
    setOs('macos')
    render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)

    const mac = screen.getByRole('link', { name: 'הורד ל-macOS' })
    expect(mac).toHaveTextContent('המחשב שלך')
    expect(mac).toHaveAccessibleDescription(/^המחשב שלך/)
    expect(screen.getByRole('link', { name: 'הורד ל-Windows' })).not.toHaveTextContent('המחשב שלך')
  })

  test('Windows שזוהה — התג על כרטיס Windows', () => {
    setOs('windows')
    render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)

    expect(screen.getByRole('link', { name: 'הורד ל-Windows' })).toHaveTextContent('המחשב שלך')
  })

  test('Linux, טלפון או לא ידוע — בלי התג "המחשב שלך"', () => {
    for (const os of ['other', 'mobile', null]) {
      if (os) setOs(os)
      else document.documentElement.removeAttribute('data-os')
      const { unmount } = render(<OfflineUpdateDownloadClient repoUrl={REPO} releases={RELEASES} />)
      expect(screen.queryByText('המחשב שלך')).not.toBeInTheDocument()
      unmount()
    }
  })
})
