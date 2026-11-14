// האתר של התוסף: קישור רק לכתובת בטוחה; javascript: מוצג כטקסט בלבד.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginOverviewPane from './PluginOverviewPane'

const plugin = (homepage) => ({ _id: 'p1', name: 'תוסף', status: 'approved', homepage, screenshots: [], tags: [] })
const renderPane = (homepage) => render(<PluginOverviewPane plugin={plugin(homepage)} mode="store" actions={[]} busy={false} onAssign={() => {}} />)

describe('PluginOverviewPane — האתר', () => {
  test('כתובת https — קישור', () => {
    renderPane('https://example.com/x')
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toHaveAttribute('href', 'https://example.com/x')
  })

  test('javascript: — טקסט בלבד, בלי קישור', () => {
    renderPane('javascript:alert(1)')
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
  })
})
