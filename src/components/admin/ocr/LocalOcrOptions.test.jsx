import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import LocalOcrOptions from './LocalOcrOptions'
import OcrJobSummary from './OcrJobSummary'

const capabilities = { state: 'available', version: 1, lmCheck: true, alternatives: true,
  lexiconAvailable: true, contextAvailable: true, lexicons: [{ name: 'modern', version: 1 }] }
function Form({ caps = capabilities }) {
  const [value, onChange] = useState({ lm: 'modern', defaultScript: 'square' })
  return <><LocalOcrOptions value={value} onChange={onChange} capabilities={caps} /><output aria-label="options">{JSON.stringify(value)}</output></>
}
it('separates domain from LM checking, leaves costly context opt-in, and distinguishes inherited/empty lexicons', async () => {
  const user = userEvent.setup()
  render(<Form />)
  expect(screen.getByRole('checkbox', { name: 'בדיקה באמצעות מודל השפה' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /חלופות למילים/ })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /חלופות למילים/ })).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: 'בדיקה באמצעות מודל השפה' }))
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toMatchObject({ lm: 'modern', lmCheck: 'off' })
  await user.click(screen.getByRole('radio', { name: /רבני/ }))
  expect(screen.getByText(/7–25 דקות/)).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: /חלופות למילים/ }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'בחירת מילונים נוספים' }), 'none')
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toMatchObject({ lm: 'rabbinic', lmCheck: 'off', alts: 'on', lexicons: [] })
  await user.selectOptions(screen.getByRole('combobox', { name: 'בחירת מילונים נוספים' }), 'custom')
  expect(JSON.parse(screen.getByLabelText('options').textContent).lexicons).toEqual(['modern'])
  await user.selectOptions(screen.getByRole('combobox', { name: 'בחירת מילונים נוספים' }), 'default')
  expect(Object.hasOwn(JSON.parse(screen.getByLabelText('options').textContent), 'lexicons')).toBe(false)
})
it('keeps the exact legacy controls until the worker advertises capabilities', () => {
  const { rerender } = render(<Form caps={null} />)
  expect(screen.getByRole('radio', { name: /כבוי/ })).toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toEqual({ lm: 'modern', defaultScript: 'square' })
  rerender(<Form caps={capabilities} />)
  expect(screen.getByRole('checkbox', { name: 'בדיקה באמצעות מודל השפה' })).toBeChecked()
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toEqual({ lm: 'modern', defaultScript: 'square' })
  rerender(<Form caps={{ state: 'stale' }} />)
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toEqual({ lm: 'modern', defaultScript: 'square' })
})
it('offers the proofreading sensitivity only when the worker supports it, and sends "normal" as an absent key', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Form />)
  expect(screen.queryByRole('radio', { name: /יותר סימונים/ })).toBeNull()
  rerender(<Form caps={{ ...capabilities, sensitivity: true }} />)
  expect(screen.getByRole('radio', { name: /^רגיל/ })).toBeChecked()
  expect(screen.getByText('פחות סימונים, כמעט כולם שגיאות אמיתיות')).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: /יותר סימונים/ }))
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toEqual({ lm: 'modern', defaultScript: 'square', sensitivity: 'more' })
  await user.click(screen.getByRole('radio', { name: /^רגיל/ }))
  expect(JSON.parse(screen.getByLabelText('options').textContent)).toEqual({ lm: 'modern', defaultScript: 'square' })
})
it('tells the administrator when OCR was delivered without the requested alternatives', () => {
  render(<OcrJobSummary job={{ status: 'completed', resultMetadata: { proofreading: { requested: true, status: 'failed', reason: 'context_timeout' } } }} />)
  expect(screen.getByRole('status')).toHaveTextContent('הזיהוי הושלם; חלופות לפי ההקשר לא חושבו')
  expect(screen.getByRole('status')).toHaveTextContent('מגבלת הזמן')
})
