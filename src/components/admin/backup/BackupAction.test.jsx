import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BackupAction from './BackupAction'

afterEach(() => vi.restoreAllMocks())

describe('הורד גיבוי', () => {
  it('לחיצה פותחת דיאלוג; "הורד גיבוי" בדיאלוג מוריד מאותה כתובת (GET בקישור)', async () => {
    const clicks = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicks.push(this.getAttribute('href')) })
    const onDone = vi.fn()
    render(<BackupAction onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'הורד גיבוי' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('ההורדה עשויה להימשך כמה דקות')
    expect(clicks).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'הורד גיבוי' }))
    expect(clicks).toEqual(['/api/admin/export-backup'])
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('ביטול — בלי הורדה', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<BackupAction triggerClassName="x" />)
    await userEvent.click(screen.getByRole('button', { name: 'הורד גיבוי' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'ביטול' }))
    expect(click).not.toHaveBeenCalled()
  })
})
