import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'

vi.mock('@/hooks/useScanLines', () => ({ useScanLines: () => ({ size: [600, 800], profile: null, status: 'idle' }) }))

import ImagePanel from '../ImagePanel'
import TextEditor from '../TextEditor'
import { usePageTracking } from './usePageTracking'

const LAYOUT = {
  layoutVersion: 1,
  image: { width: 600, height: 800 },
  toSource: [1, 0, 0, 0, 1, 0],
  lines: [
    { k: 0, bbox: [100, 50, 500, 80], text: 'בראשית ברא אלהים', words: [[400, 500, 0.99], [250, 380, 0.9], [100, 230, 0.95]] },
    { k: 1, bbox: [100, 100, 500, 130], text: 'את השמים', words: [[300, 500, 0.9], [100, 280, 0.9]] }
  ]
}
const TEXT = 'בראשית ברא אלהים\nאת השמים'

let tracking
const keep = (t) => {
  tracking = t
}
function Page({ onTracking = keep }) {
  const textRef = useRef(null)
  const [content, setContent] = useState(TEXT)
  const t = usePageTracking({ bookPath: 'b', pageNumber: 1, imageUrl: '/p.jpg', textContainerRef: textRef, imageZoom: 100, text: content })
  useEffect(() => {
    onTracking(t.tracking)
  })
  return (
    <div>
      <ImagePanel
        thumbnailUrl="/p.jpg" pageNumber={1}
        imageZoom={100} setImageZoom={() => {}}
        layoutOrientation="vertical" imagePanelWidth={50} isResizing={false} handleResizeStart={() => {}}
        {...t.imagePanelProps}
      />
      <TextEditor
        ref={textRef} content={content} leftColumn="" rightColumn="" twoColumns={false}
        rightColumnName="א" leftColumnName="ב" handleAutoSave={setContent} handleColumnChange={() => {}}
        setActiveTextarea={() => {}} selectedFont="Arial" columnWidth={50} onColumnResizeStart={() => {}}
        textAlign="right" setTextAlign={() => {}} textZoom={18} setTextZoom={() => {}}
        {...t.textEditorProps}
      />
    </div>
  )
}

const loadImage = (container) => {
  const img = container.querySelector('img')
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 600 })
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 800 })
  fireEvent.load(img)
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { layoutStatus: 'ok', layout: LAYOUT, image: { matches: true } } }) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('usePageTracking — ImagePanel + TextEditor', () => {
  it('הסמן בטקסט → פס ומסגרת בצילום, mirror מסמן את השורה, ונתוני שורת המצב', async () => {
    const { container } = render(<Page />)
    loadImage(container)
    await waitFor(() => expect(tracking.level).toBe('word'))
    const svg = container.querySelector('svg[data-scan-overlay]')
    expect(svg).toBeInTheDocument()
    // השכבה בתוך העטיפה המסובבת, ליד התמונה
    expect(svg.parentElement).toBe(container.querySelector('img').parentElement)

    const ta = container.querySelector('textarea')
    ta.focus()
    ta.setSelectionRange(TEXT.indexOf('השמים'), TEXT.indexOf('השמים'))
    fireEvent.keyUp(ta)
    await waitFor(() => expect(tracking.line).toBe(2))
    expect(tracking).toMatchObject({ source: 'layout', word: 2, lineCount: 2, wordCount: 5, estimated: false })
    expect(screen.getByTestId('scan-word-frame')).toHaveAttribute('data-kind', 'solid')
    expect(screen.getByTestId('scan-line-badge')).toHaveTextContent('2')
    const mirror = container.querySelector('[data-text-mirror="content"]')
    expect(mirror.querySelectorAll('[data-line]')[1]).toHaveAttribute('data-current')
    expect(mirror.querySelector('[data-word][data-current]')).toHaveTextContent('השמים')
  })

  it('לחיצה על מילה בצילום מזיזה את הסמן בטקסט', async () => {
    const { container } = render(<Page />)
    loadImage(container)
    await waitFor(() => expect(screen.getByTestId('scan-hit-lines')).toBeInTheDocument())
    const svg = container.querySelector('svg[data-scan-overlay]')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800 })
    fireEvent.click(screen.getByTestId('scan-hit-lines').querySelector('rect'), { clientX: 150, clientY: 65 })
    const ta = container.querySelector('textarea')
    expect(document.activeElement).toBe(ta)
    expect(ta.selectionStart).toBe(TEXT.indexOf('אלהים'))
  })

})

describe('ImagePanel בלי שכבה', () => {
  it('בלי renderOverlay — אין SVG גם אחרי טעינת התמונה', () => {
    const { container } = render(
      <ImagePanel
        thumbnailUrl="/p.jpg" pageNumber={1}
        imageZoom={100} setImageZoom={() => {}}
        layoutOrientation="vertical" imagePanelWidth={50} isResizing={false} handleResizeStart={() => {}}
      />
    )
    loadImage(container)
    expect(container.querySelector('svg')).toBeNull()
  })
})
