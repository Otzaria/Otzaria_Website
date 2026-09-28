// בדיקות ל-VersionNotice: כשגרסת ה-build ידועה אין בקשת version.json בעליית הדף,
// ועדכון מזוהה כשהשרת מדווח על גרסה אחרת; בלי גרסת build — ההתנהגות הקודמת.
import { describe, expect, test, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import VersionNotice from './VersionNotice'

const versionResponse = (version) => ({ ok: true, status: 200, json: async () => ({ version }) })

afterEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('VersionNotice', () => {
  test('עם deployVersion — אין בקשה בעליית הדף', () => {
    global.fetch = vi.fn().mockResolvedValue(versionResponse(111))
    render(<VersionNotice deployVersion="111" />)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.queryByText('האתר עודכן!')).not.toBeInTheDocument()
  })

  test('עם deployVersion — גרסה שונה בשרת מציגה הודעת עדכון בחזרה לטאב', async () => {
    global.fetch = vi.fn().mockResolvedValue(versionResponse(222))
    render(<VersionNotice deployVersion="111" />)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.getByText('האתר עודכן!')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })

  test('עם deployVersion — אותה גרסה (מספר מול מחרוזת) אינה נחשבת עדכון', async () => {
    global.fetch = vi.fn().mockResolvedValue(versionResponse(111))
    render(<VersionNotice deployVersion="111" />)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('האתר עודכן!')).not.toBeInTheDocument()
  })

  test('אותו זוג גרסאות שכבר הוצג בטאב (אחרי רענון, השרת עוד על הגרסה הישנה) — לא מוצג שוב', async () => {
    global.fetch = vi.fn().mockResolvedValue(versionResponse(222))
    const first = render(<VersionNotice deployVersion="111" />)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.getByText('האתר עודכן!')).toBeInTheDocument())
    first.unmount()

    // "רענון": הדף נטען שוב עם אותה גרסת build, והשרת עדיין מדווח 222
    render(<VersionNotice deployVersion="111" />)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('האתר עודכן!')).not.toBeInTheDocument()
  })

  test('גרסה חדשה נוספת בשרת אחרי הזוג שהוצג — מוצג שוב', async () => {
    window.sessionStorage.setItem('otzaria:version-notice-shown', '111|222')
    global.fetch = vi.fn().mockResolvedValue(versionResponse(333))
    render(<VersionNotice deployVersion="111" />)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.getByText('האתר עודכן!')).toBeInTheDocument())
  })

  test('בלי deployVersion — הבדיקה הראשונה קובעת את הבסיס (כמו קודם)', async () => {
    global.fetch = vi.fn().mockResolvedValue(versionResponse(333))
    render(<VersionNotice />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('האתר עודכן!')).not.toBeInTheDocument()
  })
})
