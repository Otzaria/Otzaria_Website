import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DialogProvider } from '@/components/providers/DialogContext'
import AllPluginsClient from './AllPluginsClient'
import type { PluginCardData } from '@/components/plugins/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const plugins = Array.from({ length: 30 }, (_, index): PluginCardData => ({
  id: `plugin-${index + 1}`, name: `תוסף ${index + 1}`, shortDescription: 'תיאור',
  description: index === 29 ? 'טקסט ייחודי' : 'תיאור',
  status: index === 29 ? 'beta' : 'stable', tags: [],
  version: '1.0.0', image: '', updatedAt: '', supportsDirectInstall: true,
  downloadUrl: `/api/plugins/plugin-${index + 1}/download`,
}))

afterEach(() => window.history.replaceState(null, '', '/'))

it('מציג תחילה 24 כרטיסים, ומעביר מיקוד לפריט הראשון שנחשף מהמקלדת', () => {
  window.history.replaceState(null, '', '/plugins/all')
  render(<DialogProvider><AllPluginsClient plugins={plugins} /></DialogProvider>)
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(24)
  expect(screen.queryByRole('heading', { name: 'תוסף 25' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'הצג תוספים נוספים' }), { detail: 0 })
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(30)
  expect(screen.getByRole('link', { name: 'תוסף 25' })).toHaveFocus()
})

it('מסנן מול הקטלוג המלא ושומר פרמטרים אחרים ואת העוגן', () => {
  window.history.replaceState(null, '', '/plugins/all?keep=1#test')
  render(<DialogProvider><AllPluginsClient plugins={plugins} /></DialogProvider>)
  const status = screen.getByRole('combobox', { name: 'סטטוס' })
  fireEvent.change(status, { target: { value: 'beta' } })
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'תוסף 30' })).toBeInTheDocument()
  expect(window.location.search).toBe('?keep=1&status=beta')
  expect(window.location.hash).toBe('#test')
})
