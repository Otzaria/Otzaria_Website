// מסך התוספים מקצה לקצה (fetch מדומה): ארבע התצוגות לפי הכתובת (כולל ?tab= הישן), מונים בלשוניות,
// "דחה" דרך חלון שאומר שהבקשה תימחק, "השהה" עם "בטל", מגירה עם לשוניות, ו"שמור שינויים" דביק בסידור החנות.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

const push = vi.fn()
vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    window.addEventListener('popstate', cb)
    return () => {
      window.removeEventListener('test-url', cb)
      window.removeEventListener('popstate', cb)
    }
  }
  return {
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}
const refreshAdminBadgeCounts = vi.hoisted(() => vi.fn())
vi.mock('@/components/admin/shell/useAdminBadgeCounts', () => ({ refreshAdminBadgeCounts }))
// חלונות כבדים שלא נבדקים כאן
vi.mock('@/components/plugins/PluginEditModal', () => ({ default: () => null }))
vi.mock('@/components/notifications/PluginNotificationSettings', () => ({ default: () => null }))

import PluginsScreen from './PluginsScreen'

const base = { status: 'stable', shortDescription: 'תיאור', compatibleWith: '0.9.89', pluginFileName: 'x.otzplugin', createdAt: '2026-10-01T10:00:00Z' }
const PENDING = [
  { ...base, _id: 'n1', name: 'זמני היום', author: 'משה', version: '1.0.0', isApproved: false, lastSubmittedAt: '2026-10-02T10:00:00Z' },
  { ...base, _id: 'u1', name: 'לוח', author: 'דוד', version: '1.2.0', isApproved: true, lastSubmittedAt: '2026-10-01T10:00:00Z',
    pendingUpdate: { name: 'לוח', version: '1.3.0', author: 'דוד' }, pendingChangeSummary: [{ field: 'version', label: 'גרסה', before: '1.2.0', after: '1.3.0' }] },
]
const APPROVED = [
  { ...base, _id: 'a1', name: 'אלף', author: 'משה', version: '2.0.0', isApproved: true, downloadCount: 10, ratingCount: 2, ratingAvg: 4.5 },
  { ...base, _id: 'b1', name: 'בית', author: 'דוד', version: '1.0.0', isApproved: true, downloadCount: 3, hasService: true },
]
const CATEGORIES = [{ id: 'c1', name: 'כלים', isVisible: true, plugins: [{ id: 'a1', isApproved: true }], sortMode: 'rating', ghostCount: 0 }]

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let routes
beforeEach(() => {
  calls = []
  push.mockClear()
  refreshAdminBadgeCounts.mockClear()
  routes = {
    'GET /api/admin/plugins?status=pending': () => json(PENDING),
    'GET /api/admin/plugins?status=approved': () => json(APPROVED),
    'GET /api/admin/plugin-categories': () => json(CATEGORIES),
    'GET /api/service-plugins/admin': () => json({}, { status: 404 }),
    'GET /api/admin/store-settings': () => json({ featuredPlugins: [{ id: 'a1', name: 'אלף', isApproved: true }], homeTitle: '', homeSubtitle: '' }),
    'GET /api/admin/plugin-store/unplaced': () => json({ plugins: [{ id: 'b1', name: 'בית', downloadCount: 3 }] }),
  }
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body ? JSON.parse(init.body) : undefined })
    const handler = routes[key]
    return handler ? handler() : json({ success: true, plugin: {} })
  }))
})

function renderAt(url) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><PluginsScreen /></ToastProvider>)
}

describe('מסך התוספים', () => {
  test('ארבע לשוניות עם מונים; "לאישור" — הוותיק ראשון, עם תג חדש / עדכון', async () => {
    renderAt('/library/admin/plugins')
    const tabs = screen.getByRole('navigation', { name: 'התצוגות של התוספים' })
    await screen.findByRole('list', { name: 'התוספים שממתינים לאישור' })
    await screen.findByRole('list', { name: 'התוספים שממתינים לאישור' })
    const links = within(tabs).getAllByRole('link')
    expect(links.map((l) => l.textContent.replace(/^[a-z_]+/, ''))).toEqual(['לאישור 2', 'בחנות 2', 'סידורסידור החנות', 'שירותתוספי שירות'])
    expect(within(tabs).getByRole('link', { name: 'סידור החנות' })).toBeInTheDocument()
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    expect(links[1]).toHaveAttribute('href', '/library/admin/plugins?view=store')
    const rows = within(screen.getByRole('list', { name: 'התוספים שממתינים לאישור' })).getAllByRole('heading')
    expect(rows.map((h) => h.textContent)).toEqual(['לוחעדכון', 'זמני היוםחדש'])
  })

  test('כתובת ישנה ?tab=approved פותחת "בחנות" ומתוקנת ל-?view=store', async () => {
    renderAt('/library/admin/plugins?tab=approved')
    expect(await screen.findByRole('list', { name: 'התוספים שבחנות' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe('?view=store'))
  })

  test('"דחה" — חלון שאומר שהבקשה תימחק, ורק אחרי אישור DELETE', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/plugins')
    await user.click(await screen.findByRole('button', { name: 'דחה: זמני היום' }))
    const dialog = await screen.findByRole('dialog', { name: 'לדחות את התוסף?' })
    expect(dialog).toHaveTextContent('תימחק')
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'דחה ומחק את ההגשה' }))
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /api/admin/plugins/n1')).toBe(true))
    expect(await screen.findByText(/נדחתה ונמחקה/)).toBeInTheDocument()
  })

  test('עדכון: "אשר" שואל ושולח approve; "דחה" אומר שהגרסה שבחנות נשארת', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/plugins')
    await user.click(await screen.findByRole('button', { name: 'דחה את העדכון: לוח' }))
    expect(await screen.findByRole('dialog', { name: 'לדחות את העדכון?' })).toHaveTextContent('הגרסה שבחנות היום נשארת')
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    await user.click(screen.getByRole('button', { name: 'אשר עדכון: לוח' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'לאשר את העדכון?' })).getByRole('button', { name: 'אשר עדכון' }))
    await waitFor(() => expect(calls.find((c) => c.key === 'PATCH /api/admin/plugins/u1')?.body).toEqual({ action: 'approve' }))
  })

  test('"מחק לצמיתות" על תוסף שהוחזר להמתנה: בלי "הגרסה שבחנות", עם מה שבאמת יימחק', async () => {
    const returned = { ...PENDING[1], _id: 'r1', isApproved: false, versions: [{ version: '1.0.0' }], downloadCount: 3076 }
    routes['GET /api/admin/plugins?status=pending'] = () => json([returned])
    const user = userEvent.setup()
    renderAt('/library/admin/plugins')
    await user.click(await screen.findByRole('button', { name: 'מחק לצמיתות: לוח' }))
    const dialog = await screen.findByRole('dialog', { name: 'למחוק את התוסף לצמיתות?' })
    expect(dialog).toHaveTextContent('2 גרסאות')
    expect(dialog).toHaveTextContent('3,076 הורדות')
    expect(dialog).toHaveTextContent('גם העדכון שממתין יימחק')
    expect(dialog).not.toHaveTextContent('הגרסה שבחנות')
    await user.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    expect(await screen.findByText(/נמחק לצמיתות/)).toBeInTheDocument()
  })

  test('"בחנות" עם עדכון שממתין: הפעולה האחרונה דוחה רק אותו, והתוסף נשאר ברשימה', async () => {
    const withUpdate = { ...APPROVED[0], pendingUpdate: { name: 'אלף', version: '2.1.0' } }
    routes['GET /api/admin/plugins?status=approved'] = () => json([withUpdate, APPROVED[1]])
    routes['GET /api/admin/plugins?status=pending'] = () => json([withUpdate])
    routes['DELETE /api/admin/plugins/a1'] = () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json(APPROVED)
      routes['GET /api/admin/plugins?status=pending'] = () => json([])
      return json({ success: true })
    }
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=store')
    await user.click(await screen.findByRole('button', { name: 'פעולות נוספות: אלף' }))
    expect(screen.queryByRole('menuitem', { name: 'מחק לצמיתות' })).toBeNull()
    await user.click(screen.getByRole('menuitem', { name: 'דחה את העדכון שממתין' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'לדחות את העדכון?' })).getByRole('button', { name: 'דחה ומחק את העדכון' }))
    expect(await screen.findByText(/נשאר בחנות/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'פתח את אלף' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: /לאישור/ })).toHaveTextContent('0'))
  })

  test('"החזר לחנות" על תוסף שהמפתח השהה: שואל, ובלי "בטל"', async () => {
    routes['GET /api/admin/plugins?status=approved'] = () => json([{ ...APPROVED[0], isSuspended: true, suspendedByRole: 'owner' }])
    routes['PATCH /api/admin/plugins/a1'] = () => json({ success: true, plugin: { suspendedByRole: null } })
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=store')
    await user.click(await screen.findByRole('button', { name: 'פעולות נוספות: אלף' }))
    await user.click(await screen.findByRole('menuitem', { name: 'החזר לחנות' }))
    const dialog = await screen.findByRole('dialog', { name: 'להחזיר לחנות תוסף שהמפתח השהה?' })
    expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'החזר לחנות' }))
    expect(await screen.findByText('״אלף״ חזר לחנות')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'בטל' })).toBeNull()
  })

  test('מונה הסרגל מתרענן אחרי דחייה, ורענון שנכשל משאיר את הרשימה עם הודעה', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/plugins')
    await user.click(await screen.findByRole('button', { name: 'דחה: זמני היום' }))
    routes['GET /api/admin/plugins?status=approved'] = () => json({ error: 'x' }, { status: 500 })
    await user.click(within(await screen.findByRole('dialog', { name: 'לדחות את התוסף?' })).getByRole('button', { name: 'דחה ומחק את ההגשה' }))
    expect(await screen.findByText(/נדחתה ונמחקה/)).toBeInTheDocument()
    await waitFor(() => expect(refreshAdminBadgeCounts).toHaveBeenCalled())
    expect(await screen.findByText(/לא הצלחנו לרענן/)).toBeInTheDocument()
    expect(screen.queryByText('לא הצלחנו לטעון את התוספים')).toBeNull()
    expect(screen.getByRole('button', { name: 'פתח את לוח' })).toBeInTheDocument()
  })

  test('"השהה" בלי שאלה, עם "בטל" שמחזיר לחנות', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=store')
    await user.click(await screen.findByRole('button', { name: 'פעולות נוספות: אלף' }))
    await user.click(await screen.findByRole('menuitem', { name: 'השהה' }))
    await waitFor(() => expect(calls.find((c) => c.key === 'PATCH /api/admin/plugins/a1')?.body).toEqual({ action: 'suspend' }))
    await user.click(await screen.findByRole('button', { name: 'בטל' }))
    await waitFor(() => expect(calls.filter((c) => c.key === 'PATCH /api/admin/plugins/a1').map((c) => c.body.action)).toEqual(['suspend', 'resume']))
  })

  test('לתוסף שירות אין "החזר להמתנה"; "מחק לצמיתות" דרך חלון אדום', async () => {
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=store')
    await user.click(await screen.findByRole('button', { name: 'פעולות נוספות: בית' }))
    expect(screen.queryByRole('menuitem', { name: 'החזר להמתנה' })).toBeNull()
    await user.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    expect(await screen.findByRole('dialog', { name: 'למחוק את התוסף לצמיתות?' })).toBeInTheDocument()
  })

  describe('פעולה מרובה', () => {
    const FIVE = ['א', 'ב', 'ג', 'ד', 'ה'].map((name, i) => ({ ...APPROVED[0], _id: `p${i}`, name }))
    const selectAll = async (user) => {
      await user.click(await screen.findByRole('checkbox', { name: 'בחר את כל התוספים בעמוד' }))
    }
    const patches = () => calls.filter((c) => c.key.startsWith('PATCH'))

    test('כשל חלקי: אומר כמה הצליחו וכמה לא, ומי שנכשל נשאר מסומן', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json(FIVE)
      routes['PATCH /api/admin/plugins/p1'] = () => json({ error: 'x' }, { status: 500 })
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await selectAll(user)
      await user.click(screen.getByRole('button', { name: 'השהה את הנבחרים' }))
      expect(await screen.findByText(/4 תוספים הושהו ולא מוצגים בחנות\. תוסף אחד לא עודכן \(״ב״\)\. נסה שוב\./)).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'בחר את ב' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'בחר את א' })).not.toBeChecked()
    })

    test('"עצור": מה שיצא מסתיים, והשאר לא נשלח, והסיכום אומר כמה', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json(FIVE)
      const waiting = []
      for (const p of FIVE) {
        routes[`PATCH /api/admin/plugins/${p._id}`] = () => new Promise((resolve) => waiting.push(() => resolve(json({ success: true, plugin: {} }))))
      }
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await selectAll(user)
      await user.click(screen.getByRole('button', { name: 'השהה את הנבחרים' }))
      expect(await screen.findByText('משהה… 0 מתוך 5')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'עצור' }))
      await waitFor(() => expect(waiting).toHaveLength(4))
      for (const go of waiting) go()
      expect(await screen.findByText(/נעצר: תוסף אחד לא עודכן/)).toBeInTheDocument()
      expect(patches()).toHaveLength(4)
    })

    test('התחברות שפגה: עוצר, ומציע להתחבר', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json(FIVE)
      for (const p of FIVE) routes[`PATCH /api/admin/plugins/${p._id}`] = () => json({}, { status: 401 })
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await selectAll(user)
      await user.click(screen.getByRole('button', { name: 'השהה את הנבחרים' }))
      expect(await screen.findByRole('link', { name: 'התחבר' })).toBeInTheDocument()
      expect(patches().length).toBeLessThan(5)
    })

    test('"החזר לחנות" על פעילים: הודעה, ולא כלום', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json(FIVE)
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await selectAll(user)
      await user.click(screen.getByRole('button', { name: 'החזר את הנבחרים לחנות' }))
      expect(await screen.findByText('כל הנבחרים כבר מוצגים בחנות.')).toBeInTheDocument()
      expect(patches()).toHaveLength(0)
    })

    test('"החזר לחנות": מי שהמפתח השהה מדלגים עליו ואומרים', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json([
        { ...FIVE[0], isSuspended: true, suspendedByRole: 'owner' },
        { ...FIVE[1], isSuspended: true, suspendedByRole: 'admin' },
      ])
      routes['PATCH /api/admin/plugins/p1'] = () => json({ success: true, plugin: {} })
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await selectAll(user)
      await user.click(screen.getByRole('button', { name: 'החזר את הנבחרים לחנות' }))
      expect(await screen.findByText(/תוסף אחד חזר לחנות\. תוסף אחד דולג: המפתח השהה/)).toBeInTheDocument()
      expect(patches().map((c) => c.key)).toEqual(['PATCH /api/admin/plugins/p1'])
    })
  })

  describe('מגירת התוסף', () => {
    test('ב"לאישור" "אשר" ו"דחה" קבועים בתחתית, בכל לשונית', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?plugin=u1')
      const drawer = await screen.findByRole('dialog', { name: 'לוח' })
      expect(within(drawer).getByRole('button', { name: 'אשר עדכון' })).toBeInTheDocument()
      await user.click(within(drawer).getByRole('tab', { name: 'גרסאות' }))
      expect(within(drawer).getByRole('button', { name: 'אשר עדכון' })).toBeInTheDocument()
      expect(within(drawer).getByRole('button', { name: 'דחה את העדכון' })).toBeInTheDocument()
    })

    test('הסתרת דירוג: בלי שאלה, הממוצע מתעדכן בשורה, ו"בטל" מחזיר', async () => {
      routes['GET /api/admin/plugins/a1/ratings'] = () => json({
        plugin: { ratingCount: 2, ratingAvg: 4.5 },
        ratings: [{ id: 'r', value: 1, userName: 'רות', isHidden: false, updatedAt: '2026-10-01T10:00:00Z' }],
      })
      routes['PATCH /api/admin/plugins/a1/ratings'] = () => json({ rating: { isHidden: true }, aggregate: { ratingCount: 1, ratingAvg: 5 } })
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store&plugin=a1&pane=ratings')
      await user.click(await screen.findByRole('button', { name: 'הסתר את הדירוג של רות' }))
      await waitFor(() => expect(calls.find((c) => c.key === 'PATCH /api/admin/plugins/a1/ratings')?.body).toEqual({ ratingId: 'r', action: 'hide' }))
      expect(screen.queryByRole('dialog', { name: /לצאת|להסתיר/ })).toBeNull()
      routes['PATCH /api/admin/plugins/a1/ratings'] = () => json({ rating: { isHidden: false }, aggregate: { ratingCount: 2, ratingAvg: 4.5 } })
      await user.click(await screen.findByRole('button', { name: 'בטל' }))
      await waitFor(() => expect(calls.filter((c) => c.key === 'PATCH /api/admin/plugins/a1/ratings').map((c) => c.body.action)).toEqual(['hide', 'unhide']))
    })

    test('ב"בחנות" אין שורת החלטה', async () => {
      renderAt('/library/admin/plugins?view=store&plugin=a1')
      const drawer = await screen.findByRole('dialog', { name: 'אלף' })
      expect(within(drawer).queryByRole('button', { name: /^אשר/ })).toBeNull()
    })

    test('"גרסאות": "הורד" הוא קישור הורדה רגיל, ולמחיקה יש שם בלי טקסט בולט', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json([{ ...APPROVED[0], versions: [{ version: '1.0.0', archivedAt: '2026-01-01' }] }, APPROVED[1]])
      renderAt('/library/admin/plugins?view=store&plugin=a1&pane=versions')
      const drawer = await screen.findByRole('dialog', { name: 'אלף' })
      const link = within(drawer).getByRole('link', { name: 'הורד את גרסה 1.0.0' })
      expect(link).toHaveAttribute('download')
      expect(link).toHaveAttribute('href', '/api/plugins/a1@1.0.0/download')
      expect(within(drawer).getByRole('button', { name: 'מחק את גרסה 1.0.0' })).not.toHaveTextContent('מחק')
    })

    test('תוסף שירות: בלי מחיקת גרסה (השרת חוסם)', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json([{ ...APPROVED[1], versions: [{ version: '0.9.0', archivedAt: '2026-01-01' }] }])
      renderAt('/library/admin/plugins?view=store&plugin=b1&pane=versions')
      const drawer = await screen.findByRole('dialog', { name: 'בית' })
      expect(within(drawer).queryByRole('button', { name: 'מחק את גרסה 0.9.0' })).toBeNull()
    })

    test('תוסף שהוחזר להמתנה: בלי התג "בחנות", ועם אזהרה בראש הסקירה', async () => {
      const returned = { ...PENDING[1], _id: 'r1', isApproved: false }
      routes['GET /api/admin/plugins?status=pending'] = () => json([returned])
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?plugin=r1')
      const drawer = await screen.findByRole('dialog', { name: 'לוח' })
      expect(within(drawer).getByRole('note')).toHaveTextContent('אי אפשר לשחזר')
      await user.click(within(drawer).getByRole('tab', { name: 'גרסאות' }))
      expect(within(drawer).queryByText('בחנות')).toBeNull()
      expect(within(drawer).getByText('לא בחנות')).toBeInTheDocument()
    })

    test('דירוגים: בלי דירוגים — מצב ריק בלבד; עם דירוג — כוכבים עם שם נגיש, ו"הצג" לדירוג מוסתר', async () => {
      routes['GET /api/admin/plugins/a1/ratings'] = () => json({ plugin: {}, ratings: [] })
      const { unmount } = renderAt('/library/admin/plugins?view=store&plugin=a1&pane=ratings')
      expect(await screen.findByRole('heading', { name: 'אין דירוגים עדיין' })).toBeInTheDocument()
      expect(screen.queryByText(/ממוצע/)).toBeNull()
      unmount()
      routes['GET /api/admin/plugins/a1/ratings'] = () => json({
        plugin: { ratingCount: 1, ratingAvg: 4 },
        ratings: [{ id: 'r', value: 4, userName: 'רות', isHidden: true, hiddenByName: 'נתן', updatedAt: '2026-10-01T10:00:00Z' }],
      })
      renderAt('/library/admin/plugins?view=store&plugin=a1&pane=ratings')
      expect(await screen.findByRole('img', { name: '4 מתוך 5' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'הצג את הדירוג של רות' })).toBeInTheDocument()
      expect(screen.getByText(/הוסתר על ידי/)).toBeInTheDocument()
    })
  })

  describe('כתובת', () => {
    test('קישור לתוסף שלא קיים: הודעה, והכתובת מתנקה', async () => {
      renderAt('/library/admin/plugins?view=store&plugin=doesnotexist')
      expect(await screen.findByText(/התוסף לא נמצא ברשימה/)).toBeInTheDocument()
      await waitFor(() => expect(window.location.search).toBe('?view=store'))
    })

    test('קישור לתוסף שבתצוגה השנייה: עובר אליה ופותח את המגירה', async () => {
      renderAt('/library/admin/plugins?plugin=a1')
      expect(await screen.findByRole('dialog', { name: 'אלף' })).toBeInTheDocument()
      expect(window.location.search).toContain('view=store')
      expect(screen.queryByText(/התוסף לא נמצא/)).toBeNull()
    })

    test('עמוד שלא קיים — הכתובת מתוקנת', async () => {
      renderAt('/library/admin/plugins?view=store&page=999')
      await screen.findByRole('button', { name: 'פעולות נוספות: אלף' })
      await waitFor(() => expect(window.location.search).toBe('?view=store'))
    })

    test('אחרי אישור מהמגירה: בלי הודעת "לא נמצא"', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?plugin=u1')
      const drawer = await screen.findByRole('dialog', { name: 'לוח' })
      await user.click(within(drawer).getByRole('button', { name: 'אשר עדכון' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'לאשר את העדכון?' })).getByRole('button', { name: 'אשר עדכון' }))
      await screen.findByText(/העדכון של ״לוח״ אושר/)
      expect(screen.queryByText(/התוסף לא נמצא/)).toBeNull()
    })
  })

  describe('שורות', () => {
    test('תוסף בלי שם: בלי undefined בשם הנגיש', async () => {
      routes['GET /api/admin/plugins?status=approved'] = () => json([{ ...APPROVED[0], name: undefined }])
      renderAt('/library/admin/plugins?view=store')
      expect(await screen.findByRole('checkbox', { name: 'בחר את תוסף בלי שם' })).toBeInTheDocument()
      expect(document.body.innerHTML).not.toContain('undefined')
    })

    test('השם הוא כפתור אמיתי, גם במקלדת', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      const name = await screen.findByRole('button', { name: 'פתח את אלף' })
      expect(name).toHaveTextContent('אלף')
      name.focus()
      await user.keyboard('{Enter}')
      expect(await screen.findByRole('dialog', { name: 'אלף' })).toBeInTheDocument()
    })

    test('סגירת מגירה: הפוקוס חוזר לשם התוסף בשורה', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins')
      await user.click(await screen.findByRole('button', { name: 'פתח את לוח' }))
      await screen.findByRole('dialog', { name: 'לוח' })
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'לוח' })).toBeNull())
      await waitFor(() => expect(screen.getByRole('button', { name: 'פתח את לוח' })).toHaveFocus())
    })

    test('"לאישור" ריק: בלי חיפוש וסינון', async () => {
      routes['GET /api/admin/plugins?status=pending'] = () => json([])
      renderAt('/library/admin/plugins')
      expect(await screen.findByRole('heading', { name: 'אין תוספים לאישור' })).toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).toBeNull()
    })

    test('מונה קטגוריה סופר רק מי שברשימה', async () => {
      routes['GET /api/admin/plugin-categories'] = () => json([{ ...CATEGORIES[0], plugins: [{ id: 'a1', isApproved: true }, { id: 'gone', isApproved: false }] }])
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=store')
      await user.click(await screen.findByRole('button', { name: /^קטגוריה/ }))
      expect(await screen.findByRole('option', { name: /כלים/ })).toHaveTextContent('1')
    })
  })

  test('סינון לפי קטגוריה "לא משובץ" ומונה', async () => {
    renderAt('/library/admin/plugins?view=store&cat=none')
    const list = await screen.findByRole('list', { name: 'התוספים שבחנות' })
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['ביתתוסף שירות'])
  })

  test('מגירה מהכתובת: לשוניות, ו"דירוגים" נטען בלחיצה', async () => {
    routes['GET /api/admin/plugins/a1/ratings'] = () => json({ plugin: { ratingAvg: 4.5, ratingCount: 2, ratingVerifiedCount: 1 }, ratings: [] })
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=store&plugin=a1')
    const drawer = await screen.findByRole('dialog', { name: 'אלף' })
    const tabs = within(drawer).getByRole('tablist')
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['סקירה', 'גרסאות', 'דירוגים', 'שיבוץ'])
    await user.click(within(tabs).getByRole('tab', { name: 'דירוגים' }))
    expect(await within(drawer).findByText('אין דירוגים עדיין')).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toContain('pane=ratings'))
  })

  test('סידור החנות: שינוי סדר → "שמור שינויים" דביק, ושמירה שולחת את הסדר החדש', async () => {
    routes['PATCH /api/admin/store-settings'] = () => json({ settings: { featuredPlugins: [], homeTitle: '', homeSubtitle: '' } })
    const user = userEvent.setup()
    renderAt('/library/admin/plugins?view=layout')
    await user.click(await screen.findByRole('button', { name: 'הסר: אלף' }))
    expect(await screen.findByText('יש שינויים שלא נשמרו.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    await waitFor(() => expect(calls.find((c) => c.key === 'PATCH /api/admin/store-settings')?.body).toEqual({ featuredPluginIds: [], homeTitle: '', homeSubtitle: '' }))
  })

  describe('סידור החנות', () => {
    const FEATURED = [{ id: 'a1', name: 'אלף', isApproved: true }, { id: 'x9', name: 'הוחזר', isApproved: false }]
    const settings = () => json({ featuredPlugins: FEATURED, homeTitle: 'כותרת', homeSubtitle: '' })

    test('"בטל שינויים" מחזיר נבחר שאינו ברשימת המאושרים, והפס נעלם', async () => {
      routes['GET /api/admin/store-settings'] = settings
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await user.click(await screen.findByRole('button', { name: 'הסר: הוחזר' }))
      expect(screen.queryByRole('button', { name: 'הסר: הוחזר' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'בטל שינויים' }))
      expect(screen.getByRole('button', { name: 'הסר: הוחזר' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'שמור שינויים' })).toBeNull()
    })

    test('כותרת בלבד: אותו כפתור, והוא לא קורא לזה "סדר"', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await user.type(await screen.findByLabelText('כותרת דף הבית'), 'חדש')
      expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeInTheDocument()
      expect(screen.getAllByText('יש שינויים שלא נשמרו.').length).toBeGreaterThan(0)
    })

    test('"רענן" טוען מחדש את מה שעל המסך, ועם שינוי שלא נשמר שואל קודם', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await user.type(await screen.findByLabelText('כותרת דף הבית'), 'חדש')
      const before = calls.filter((c) => c.key === 'GET /api/admin/store-settings').length
      await user.click(screen.getByRole('button', { name: 'הגדרות התוספים' }))
      await user.click(await screen.findByRole('menuitem', { name: 'רענן' }))
      await user.click(await screen.findByRole('button', { name: 'הישאר' }))
      expect(calls.filter((c) => c.key === 'GET /api/admin/store-settings')).toHaveLength(before)
      await user.click(screen.getByRole('button', { name: 'הגדרות התוספים' }))
      await user.click(await screen.findByRole('menuitem', { name: 'רענן' }))
      await user.click(await screen.findByRole('button', { name: 'צא בלי לשמור' }))
      await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/admin/store-settings').length).toBe(before + 1))
      expect(await screen.findByText('הנתונים עודכנו')).toBeInTheDocument()
    })

    test('שינוי בקטגוריות מגיע גם ל"בחנות" (הרשימות של המסך נטענות מחדש)', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await screen.findByRole('button', { name: 'ערוך את כלים' })
      const before = calls.filter((c) => c.key === 'GET /api/admin/plugin-categories').length
      await user.click(screen.getByRole('button', { name: 'שבץ את בית בקטגוריה' }))
      await user.click(await screen.findByRole('option', { name: 'כלים' }))
      await screen.findByText('״בית״ שובץ ב״כלים״')
      // פעם של "סידור החנות" ופעם של הרשימות
      await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/admin/plugin-categories').length).toBe(before + 2))
    })

    test('401 בטעינה: "התחבר" ולא "נסה שוב"', async () => {
      routes['GET /api/admin/store-settings'] = () => json({}, { status: 401 })
      renderAt('/library/admin/plugins?view=layout')
      expect(await screen.findByRole('link', { name: 'התחבר' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
    })

    test('403 בטעינה: הסיבה, בלי "נסה שוב"', async () => {
      routes['GET /api/admin/store-settings'] = () => json({}, { status: 403 })
      renderAt('/library/admin/plugins?view=layout')
      expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'נסה שוב' })).toBeNull()
    })

    test('קטגוריות: הפוקוס נשאר על החץ אחרי ההזזה, והמקום החדש מוכרז', async () => {
      const two = [CATEGORIES[0], { ...CATEGORIES[0], id: 'c2', name: 'שני', plugins: [] }]
      routes['GET /api/admin/plugin-categories'] = () => json(two)
      routes['PATCH /api/admin/plugin-categories/c1'] = () => {
        routes['GET /api/admin/plugin-categories'] = () => json([two[1], two[0]])
        return json({ success: true })
      }
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await user.click(await screen.findByRole('button', { name: 'הזז למטה: כלים' }))
      expect(await screen.findByText('״כלים״ הועבר למקום 2 מתוך 2')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: 'הזז למעלה: כלים' })).toHaveFocus())
    })

    test('קישור בסרגל, עם שינוי שלא נשמר: שואל', async () => {
      const user = userEvent.setup()
      const sidebar = document.createElement('a')
      sidebar.href = '/library/admin/plugins?view=store'
      sidebar.textContent = 'בחנות בסרגל'
      document.body.append(sidebar)
      renderAt('/library/admin/plugins?view=layout')
      await user.type(await screen.findByLabelText('כותרת דף הבית'), 'חדש')
      await user.click(sidebar)
      expect(await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })).toHaveTextContent('השינויים בסידור החנות לא נשמרו.')
      await user.click(screen.getByRole('button', { name: 'הישאר' }))
      expect(window.location.search).toBe('?view=layout')
      sidebar.remove()
    })

    test('"אחורה" עם מגירת קטגוריה שיש בה שינוי: המסך שומר, ולא הטופס נמחק בשקט', async () => {
      const user = userEvent.setup()
      renderAt('/library/admin/plugins?view=layout')
      await user.click(await screen.findByRole('button', { name: 'ערוך את כלים' }))
      await user.type(screen.getByLabelText('תיאור'), 'טקסט')
      await waitFor(() => expect(window.history.state?.__unsavedGuard).toBe(true))
      window.history.back()
      expect(await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'הישאר' }))
      expect(screen.getByLabelText('תיאור')).toHaveValue('טקסט')
    })
  })

  test('תוספי שירות כבויים (404) — הודעה ולא שגיאה', async () => {
    renderAt('/library/admin/plugins?view=service')
    expect(await screen.findByText('תוספי השירות כבויים באתר')).toBeInTheDocument()
  })
})
