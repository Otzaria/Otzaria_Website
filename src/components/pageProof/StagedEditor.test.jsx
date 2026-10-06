import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import StagedEditor from './StagedEditor'
import { DRAFT_IDLE_MS, DRAFT_SAVE_MS } from '@/lib/pageProof/draftRules'
import { STAGE_TEXT } from '@/lib/pageProof/stages'

// Keep the real draft hook and stage controls: status changes must neither
// bypass the save delay nor overwrite the stage chosen by the volunteer.
const h = vi.hoisted(() => ({ onOpsChange: null }))
vi.mock('./ProofEditor', () => ({
  default: (props) => {
    h.onOpsChange = props.onOpsChange
    return props.actions({ ops: [], view: {}, approval: { total: 0 } })
  },
}))

const PAGE = { id: '64b7f0c2a1b2c3d4e5f60718', revision: 1 }
const TEXT = { kind: 'text', page: 4, ids: [1], value: 'תיקון' }
let puts

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  puts = []
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    puts.push(JSON.parse(init.body))
    return {
      ok: true,
      json: async () => ({ success: true, updatedAt: new Date(1700000000000 + puts.length).toISOString() }),
    }
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const tick = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}
const mount = () => render(<StagedEditor current={{ page: PAGE, draftKey: 'staged-editor-regression' }} />)
const edit = (value) => act(() => h.onOpsChange([{ ...TEXT, value }]))

it('new page edits respect the save delay and five-second interval', async () => {
  mount()
  await tick()
  expect(puts).toHaveLength(1)
  expect(puts[0]).toMatchObject({ stage: 'structure', ops: [] })

  for (const value of ['א', 'אב', 'אבג']) {
    edit(value)
    await tick()
  }
  expect(puts).toHaveLength(1)
  await tick(DRAFT_SAVE_MS)
  expect(puts).toHaveLength(2)
  expect(puts[1].ops).toEqual([{ ...TEXT, value: 'אבג' }])

  edit('אבגד')
  await tick(DRAFT_IDLE_MS)
  expect(puts).toHaveLength(2)
  await tick(DRAFT_SAVE_MS - DRAFT_IDLE_MS)
  expect(puts).toHaveLength(3)
  expect(puts[2].ops).toEqual([{ ...TEXT, value: 'אבגד' }])
})

it('new page keeps the chosen stage after saving and subsequent edits', async () => {
  mount()
  await tick()
  fireEvent.click(screen.getByRole('button', { name: new RegExp(STAGE_TEXT.skip) }))
  await tick()
  expect(screen.getByTestId('stage-bar')).toHaveAttribute('data-stage', 'text')
  expect(puts.map((p) => p.stage)).toEqual(['structure', 'text'])

  edit('טקסט מתוקן')
  await tick(DRAFT_SAVE_MS)
  expect(puts).toHaveLength(3)
  expect(puts[2]).toMatchObject({ stage: 'text', ops: [{ ...TEXT, value: 'טקסט מתוקן' }] })

  fireEvent.click(screen.getByRole('button', { name: new RegExp(STAGE_TEXT.back) }))
  await tick()
  expect(screen.getByTestId('stage-bar')).toHaveAttribute('data-stage', 'structure')
  expect(puts).toHaveLength(4)
  expect(puts[3]).toMatchObject({ stage: 'structure', ops: [{ ...TEXT, value: 'טקסט מתוקן' }] })
})
