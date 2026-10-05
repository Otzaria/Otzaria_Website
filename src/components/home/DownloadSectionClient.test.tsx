import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DownloadSectionClient from './DownloadSectionClient'

// מבנה התשובה של /api/github-releases ל-0.9.98 (עם מסייע) ול-0.9.97 (בלי מסייע)
const WITH_ASSISTANT = {
  version: '0.9.98+801',
  windows: {
    assistant: 'url:Otzaria-Download-Assistant-windows.exe',
    exe: 'url:otzaria-0.9.98-windows.exe',
    zip: 'url:otzaria-windows.zip'
  },
  linux: {
    assistantX64: 'url:Otzaria-Download-Assistant-linux-x64.tar.gz',
    assistantArm64: 'url:Otzaria-Download-Assistant-linux-arm64.tar.gz',
    deb: 'url:otzaria-linux.deb'
  },
  macos: {
    assistant: 'url:Otzaria-Download-Assistant-macos.zip',
    dmg: 'url:otzaria-macos.dmg',
    zip: 'url:otzaria-macos.zip'
  },
  android: { apk: 'url:app-release.apk' }
}

const WITHOUT_ASSISTANT = {
  version: '0.9.97+789',
  windows: { exe: 'url:otzaria-0.9.97-windows.exe', exeFull: 'url:otzaria-0.9.97-windows-full.exe' },
  macos: { dmg: 'url:otzaria-macos.dmg', zip: 'url:otzaria-macos.zip' }
}

function openPlatform(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
  return screen.getByRole('heading', { name: new RegExp(`הורדת אוצריא ל-${name}`) }).closest('div.flex-col') as HTMLElement
}

const hrefs = (modal: HTMLElement) =>
  within(modal).getAllByRole('link').map((link) => link.getAttribute('href'))

describe('DownloadSectionClient — מסייע ההורדה', () => {
  // UA ניטרלי: בלי זיהוי פלטפורמה מוצגים כל כפתורי הפלטפורמות בכל מערכת שמריצה את הטסט
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('test-agent')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Windows: מציג רק את המסייע, עם הודעה בולטת שאינו קובץ ההתקנה', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const modal = openPlatform('Windows')
    expect(hrefs(modal)).toEqual(['url:Otzaria-Download-Assistant-windows.exe'])
    expect(within(modal).getByRole('note')).toHaveTextContent('זה אינו קובץ ההתקנה של אוצריא עצמה, אלא מסייע ההורדה')
    expect(within(modal).getByText('מסייע ההורדה של אוצריא')).toBeInTheDocument()
    expect(within(modal).queryByText('EXE Installer')).not.toBeInTheDocument()
  })

  it('Linux: שתי אפשרויות לפי ארכיטקטורה והסבר איך לדעת', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const modal = openPlatform('Linux')
    expect(hrefs(modal)).toEqual([
      'url:Otzaria-Download-Assistant-linux-x64.tar.gz',
      'url:Otzaria-Download-Assistant-linux-arm64.tar.gz'
    ])
    expect(within(modal).getByText(/uname -m/)).toBeInTheDocument()
  })

  it('macOS: מציג רק את המסייע', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(hrefs(openPlatform('macOS'))).toEqual(['url:Otzaria-Download-Assistant-macos.zip'])
  })

  it('כפתור הפלטפורמה מציין שההורדה היא דרך המסייע רק כשיש מסייע', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(screen.getByRole('button', { name: /Windows/ })).toHaveTextContent('באמצעות מסייע ההורדה')
    expect(screen.getByRole('button', { name: /Android/ })).not.toHaveTextContent('מסייע')
  })

  it('release בלי מסייע: האפשרויות הקיימות ובלי ההודעה', () => {
    render(<DownloadSectionClient stableDownloads={WITHOUT_ASSISTANT} />)
    const modal = openPlatform('Windows')
    expect(hrefs(modal)).toEqual(['url:otzaria-0.9.97-windows.exe', 'url:otzaria-0.9.97-windows-full.exe'])
    expect(within(modal).queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Windows/ })).not.toHaveTextContent('מסייע')
  })

  it('Android: Google Play ו-APK נשארים, ומתחתם הודעה עם קישור למסייע ה-Windows', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const modal = openPlatform('Android')
    expect(hrefs(modal)).toEqual([
      'https://play.google.com/store/apps/details?id=org.otzaria.otzaria',
      'url:app-release.apk',
      'url:Otzaria-Download-Assistant-windows.exe'
    ])
    const note = within(modal).getByRole('note')
    expect(note).toHaveTextContent('אין אינטרנט במכשיר?')
    expect(within(note).getByRole('link', { name: /הורדת מסייע ההורדה ל-Windows/ }))
      .toHaveAttribute('href', 'url:Otzaria-Download-Assistant-windows.exe')
  })

  it('Android בלי מסייע Windows ב-release: בלי ההודעה', () => {
    render(<DownloadSectionClient stableDownloads={{ ...WITHOUT_ASSISTANT, android: { apk: 'url:app-release.apk' } }} />)
    const modal = openPlatform('Android')
    expect(hrefs(modal)).toEqual([
      'https://play.google.com/store/apps/details?id=org.otzaria.otzaria',
      'url:app-release.apk'
    ])
    expect(within(modal).queryByRole('note')).not.toBeInTheDocument()
  })
})
