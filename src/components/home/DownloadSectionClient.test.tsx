import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
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
  return screen.getByRole('dialog', { name: new RegExp(`הורדת אוצריא ל-${name}`) })
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

  it('Windows: מציג רק את המסייע, עם שורת הסבר שאינו תוכנת ההתקנה', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const modal = openPlatform('Windows')
    expect(hrefs(modal)).toEqual(['url:Otzaria-Download-Assistant-windows.exe'])
    expect(within(modal).getByRole('note')).toHaveTextContent('זה מסייע ההורדה, לא תוכנת ההתקנה')
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

  it('macOS: מציג רק את המסייע, עם הערת Gatekeeper', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const modal = openPlatform('macOS')
    expect(hrefs(modal)).toEqual(['url:Otzaria-Download-Assistant-macos.zip'])
    expect(within(modal).getByText(/פתח בכל זאת/)).toBeInTheDocument()
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
    expect(within(note).getByRole('link', { name: /הורדת המסייע ל-Windows/ }))
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

  it('Linux: בלי הוראת glib-networking (המסייע מציג אותה בעצמו)', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(within(openPlatform('Linux')).queryByText(/glib-networking/)).not.toBeInTheDocument()
  })
})

describe('DownloadSectionClient — נגישות חלון ההורדה', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('test-agent')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dialog מודאלי עם כותרת, פוקוס בפנים ונעילת גלילה', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const dialog = openPlatform('Windows')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    expect(within(dialog).getByRole('button', { name: 'סגירה' })).toBeInTheDocument()
  })

  it('Esc סוגר ומחזיר את הפוקוס לכפתור שפתח', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const opener = screen.getByRole('button', { name: /Linux/ })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('כפתור הסגירה סוגר', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const dialog = openPlatform('macOS')
    fireEvent.click(within(dialog).getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Tab מהפקד האחרון חוזר לראשון (מלכודת פוקוס)', () => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const dialog = openPlatform('Linux')
    const close = within(dialog).getByRole('button', { name: 'סגירה' })
    const links = within(dialog).getAllByRole('link')
    links[links.length - 1].focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(links[links.length - 1]).toHaveFocus()
  })
})

describe('DownloadSectionClient — נוסח החלונות', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('test-agent')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['Windows', 'macOS', 'Linux'])('%s: שורת ההסבר — רווח לא-נשבר אמיתי לפני הקו, בלי "00a0" גלוי', (name) => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const text = within(openPlatform(name)).getByRole('note').textContent ?? ''
    expect(text).not.toMatch(/00a0|\\u/i)
    expect(text).toContain('\u00a0—')
  })

  it.each(['Windows', 'macOS', 'Linux', 'Android', 'iOS'])('%s: בלי שורת גרסה בחלון (הגרסה במסך הפתיחה)', (name) => {
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    const dialog = openPlatform(name)
    expect(dialog.textContent).not.toMatch(/גרסה|0\.9\.98|00a0/)
  })
})

describe('DownloadSectionClient — זיהוי המערכת (QA-04) ותקינות הכפתורים (QA-11, QA-12)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ה-HTML מהשרת (לפני הזיהוי): טקסט ניטרלי ושומר מקום שקוף בגובה כרטיס המערכת — בלי "לא הצלחנו"', () => {
    const html = renderToString(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(html).toContain('הורדה למחשב ולנייד')
    expect(html).not.toContain('לא הצלחנו')
    const host = document.createElement('div')
    host.innerHTML = html
    const placeholder = host.querySelector('[data-testid="detected-platform-placeholder"]')
    expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    expect(placeholder).toHaveClass('invisible')
  })

  it('אחרי הזיהוי: כרטיס המערכת שזוהתה במקום שומר המקום', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(screen.getByText('זיהינו שאתה משתמש ב-Windows')).toBeInTheDocument()
    expect(screen.queryByTestId('detected-platform-placeholder')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Windows/ })).toBeInTheDocument()
  })

  it('מערכת לא מזוהה: רק אחרי הבדיקה — "לא הצלחנו לזהות" וכל המערכות', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('test-agent')
    render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(screen.getByText(/לא הצלחנו לזהות/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Windows|Linux|Android|iOS|macOS/ })).toHaveLength(5)
  })

  it('בתוך כפתורי המערכות אין כותרות, והאייקונים מוסתרים מקוראי מסך', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('test-agent')
    const { container } = render(<DownloadSectionClient stableDownloads={WITH_ASSISTANT} />)
    expect(container.querySelector('button h1, button h2, button h3, button h4')).toBeNull()
    for (const icon of container.querySelectorAll('button .material-symbols-outlined')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.getByRole('button', { name: /^Windows/ })).toBeInTheDocument()
  })
})
