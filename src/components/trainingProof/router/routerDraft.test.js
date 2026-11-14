import { describe, it, expect } from 'vitest'
import {
  initDraft,
  withInkWords,
  isComplete,
  toMarkBody,
  setLine,
  setBad,
  setWord,
  acceptSuggestion,
  keyAction,
  nextOpenWord,
  isMixed,
  missingWords,
} from './routerDraft'

const words = [
  { k: 0, box: [400, 0, 500, 50], pred: 'square' },
  { k: 1, box: [200, 0, 390, 50], pred: 'rashi' },
]
const item = (extra = {}) => ({ id: 'a', pred: 'mixed', words, result: null, ...extra })

describe('routerDraft', () => {
  it('טיוטה ריקה; שורה לא-מעורבת שלמה מיד', () => {
    const d = initDraft(item({ pred: 'rashi' }))
    expect(isComplete(d)).toBe(false)
    const d2 = setLine(d, 'square')
    expect(isComplete(d2)).toBe(true)
    expect(toMarkBody(d2)).toEqual({ label: 'square' })
  })

  it('פסול', () => {
    const d = setBad(initDraft(item()))
    expect(isComplete(d)).toBe(true)
    expect(toMarkBody(d)).toEqual({ bad: true })
  })

  it('מעורבת: שלמה רק כשלכל מילה יש כתב', () => {
    let d = setLine(initDraft(item()), 'mixed')
    expect(isMixed(d, item())).toBe(true)
    expect(missingWords(d)).toBe(2)
    d = setWord(d, 0, 'square')
    expect(isComplete(d)).toBe(false)
    d = setWord(d, 1, 'neutral')
    expect(isComplete(d)).toBe(true)
    expect(toMarkBody(d)).toEqual({
      label: 'mixed',
      words: [
        { k: 0, box: [400, 0, 500, 50], label: 'square' },
        { k: 1, box: [200, 0, 390, 50], label: 'neutral' },
      ],
    })
  })

  it('Enter: ההצעה לשורה, ובמעורבת — ההצעה לכל מילה שלא סומנה', () => {
    expect(acceptSuggestion(initDraft(item({ pred: 'latin' })), item({ pred: 'latin' })).label).toBe('latin')
    let d = setWord(initDraft(item()), 1, 'latin')
    d = acceptSuggestion(d, item())
    expect(d.words.map((w) => w.label)).toEqual(['square', 'latin'])
    // בלי הצעה — כלום
    expect(acceptSuggestion(initDraft(item({ pred: null })), item({ pred: null })).label).toBe(null)
  })

  it('שורה בלי מילים מהתחנה — המילים מהדיו', () => {
    const it0 = item({ words: null })
    let d = initDraft(it0)
    expect(d.words).toBe(null)
    d = withInkWords(d, [[300, 2, 500, 48], [10, 2, 280, 48]])
    expect(d.wordsSrc).toBe('site')
    expect(d.words.map((w) => w.k)).toEqual([0, 1])
    // לא דורס מילים קיימות
    expect(withInkWords(initDraft(item()), [[0, 0, 1, 1]]).words).toHaveLength(2)
  })

  it('טיוטה ממה שכבר נשמר', () => {
    const saved = initDraft(item({ result: { label: 'mixed', words: [{ k: 0, box: words[0].box, label: 'rashi' }, { k: 1, box: words[1].box, label: 'rashi' }], words_src: 'station' } }))
    expect(saved.words.map((w) => [w.label, w.pred])).toEqual([['rashi', 'square'], ['rashi', 'rashi']])
    expect(initDraft(item({ result: { label: '', bad: true } })).bad).toBe(true)
  })

  it('מקשים: 1–4 לשורה; במילים 4 = ניטרלי; 0 = פסול', () => {
    expect(keyAction('2', 'line')).toEqual({ type: 'line', label: 'rashi' })
    expect(keyAction('4', 'line')).toEqual({ type: 'line', label: 'mixed' })
    expect(keyAction('4', 'words')).toEqual({ type: 'word', label: 'neutral' })
    expect(keyAction('0', 'words')).toEqual({ type: 'bad' })
    expect(keyAction('7', 'line')).toBe(null)
  })

  it('המילה הבאה שלא סומנה', () => {
    let d = setLine(initDraft(item()), 'mixed')
    expect(nextOpenWord(d, 0)).toBe(1)
    d = setWord(d, 1, 'rashi')
    expect(nextOpenWord(d, 1)).toBe(0)
  })
})
