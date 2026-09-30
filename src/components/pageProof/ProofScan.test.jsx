import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProofScan from './ProofScan'

// בסביבת-הבדיקות ל-SVG אין מידות על המסך, ולכן נקודת-לקוח = נקודה בתמונה
// חלקי הזום (zoom=1 — אותה נקודה)

const L = (id, bbox, extra = {}) => ({ id, bbox, order: id, text: `שורה ${id}`, status: 'pending', stream: 'main', words: [], ...extra })

const view = () => ({
  page: 3,
  size: [1000, 1000],
  streams: [{ key: 'main', he: 'ראשי', color: '#1a56db' }],
  lines: [
    L(1, [520, 100, 900, 140]),
    L(2, [520, 150, 900, 190]),
    L(3, [100, 100, 480, 140], { status: 'removed' }),
    L(-11, [100, 300, 480, 340], { _new: true, _recut: true }),
  ],
})

const frames = [
  { fid: 'aa11bb', stream: 'main', bbox: [510, 90, 910, 200], order: 1 },
  { fid: 'cc22dd', stream: 'notes', bbox: [90, 700, 910, 800], order: 2 },
]

const svgOf = () => screen.getByRole('img', { name: 'סריקת העמוד' })
const down = (el, x, y, extra = {}) => fireEvent.pointerDown(el, { button: 0, clientX: x, clientY: y, pointerId: 1, ...extra })
const move = (el, x, y) => fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 })
const up = (el, x, y) => fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 })

describe('ProofScan', () => {
  it('מצב מסגרות: מסגרות עם תוויות, בלי תיבות-שורה; פס על השורה של הסמן', () => {
    const seqs = new Map([['aa11bb', 1], ['cc22dd', 1]])
    const { container } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} seqs={seqs} currentLineId={2} />)
    expect(container.querySelectorAll('[data-frame]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-line-box]')).toHaveLength(0)
    const badges = screen.getAllByTestId('frame-badge')
    expect(badges[0]).toHaveTextContent('ראשי 1')
    expect(badges[1]).toHaveTextContent('הערות 1')
    expect(screen.getByTestId('caret-marker')).toBeInTheDocument()
  })

  it('הצעה: מקווקוות ומסומנות "הצעה"', () => {
    const { container } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} suggested />)
    expect(container.querySelector('[data-frame="aa11bb"]').getAttribute('stroke-dasharray')).toBeTruthy()
    expect(screen.getAllByText(/הצעה/)).toHaveLength(2)
  })

  it('מצב שורות: תיבות; לא-שורה מקווקוות; "לזיהוי מחדש" על שורות-חיתוך', () => {
    const { container } = render(<ProofScan view={view()} imageUrl="/p.png" mode="lines" recutIds={new Set([-11])} selectedIds={[1]} />)
    expect(container.querySelectorAll('[data-line-box]')).toHaveLength(4)
    expect(container.querySelector('[data-line-box="3"]').getAttribute('data-removed')).toBe('1')
    expect(container.querySelector('[data-line-box="-11"]').getAttribute('data-recut')).toBe('1')
    expect(container.querySelector('[data-line-box="1"]').getAttribute('class')).toContain('stroke-primary')
    expect(screen.getAllByTestId('recut-label')).toHaveLength(1)
    expect(container.querySelectorAll('[data-frame]')).toHaveLength(0)
  })

  it('לחיצה בלי גרירה: onClick עם המסגרת והשורה שמתחת לעכבר', () => {
    const onClick = vi.fn()
    render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} onClick={onClick} />)
    down(svgOf(), 700, 170)
    up(svgOf(), 701, 171)
    expect(onClick).toHaveBeenCalledTimes(1)
    const arg = onClick.mock.calls[0][0]
    expect(arg.frame.fid).toBe('aa11bb')
    expect(arg.line.id).toBe(2)
    expect(arg.point).toEqual([701, 171])
  })

  it('ציור: גרירה ← onDraw עם תיבה תקינה; גרירה קצרה מדי — כלום', () => {
    const onDraw = vi.fn()
    render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" tool="draw" frames={[]} onDraw={onDraw} />)
    down(svgOf(), 300, 400)
    move(svgOf(), 120.4, 250)
    up(svgOf(), 120.4, 250)
    expect(onDraw).toHaveBeenCalledWith([120, 250, 300, 400], expect.objectContaining({ point: [120, 250] }))
    down(svgOf(), 300, 400)
    move(svgOf(), 306, 404)
    up(svgOf(), 306, 404)
    expect(onDraw).toHaveBeenCalledTimes(1)
  })

  it('גרירת מסגרת נבחרת מזיזה אותה; פינה משנה גודל', () => {
    const onFrameBox = vi.fn()
    const { container } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" onFrameBox={onFrameBox} />)
    down(svgOf(), 600, 150)
    move(svgOf(), 580, 170)
    up(svgOf(), 580, 170)
    expect(onFrameBox).toHaveBeenLastCalledWith('aa11bb', [490, 110, 890, 220])

    const se = container.querySelector('[data-handle="se"][data-fid="aa11bb"]')
    down(se, 910, 200)
    move(svgOf(), 950, 260)
    up(svgOf(), 950, 260)
    expect(onFrameBox).toHaveBeenLastCalledWith('aa11bb', [510, 90, 950, 260])
  })

  it('גרירה על מסגרת שאינה נבחרת — גלילה, לא הזזה; לקריאה בלבד — בלי ידיות', () => {
    const onFrameBox = vi.fn()
    const { container, rerender } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} onFrameBox={onFrameBox} />)
    down(svgOf(), 600, 150)
    move(svgOf(), 560, 190)
    up(svgOf(), 560, 190)
    expect(onFrameBox).not.toHaveBeenCalled()
    rerender(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" readOnly onFrameBox={onFrameBox} />)
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(0)
  })

  it('שורות: שינוי תיבה בפינה ← onLineBox; פיצול — קו-עזר מעל השורה', () => {
    const onLineBox = vi.fn()
    const { container, rerender } = render(<ProofScan view={view()} imageUrl="/p.png" mode="lines" selectedIds={[1]} resizeLineId={1} onLineBox={onLineBox} />)
    const nw = container.querySelector('[data-handle="nw"][data-line="1"]')
    down(nw, 520, 100)
    move(svgOf(), 500, 95)
    up(svgOf(), 500, 95)
    expect(onLineBox).toHaveBeenCalledWith(1, [500, 95, 900, 140])

    rerender(<ProofScan view={view()} imageUrl="/p.png" mode="lines" tool="split" />)
    move(svgOf(), 700, 120)
    const guide = screen.getByTestId('split-guide')
    expect(guide.getAttribute('x1')).toBe('700')
  })

  it('שורות מחוץ לכל מסגרת — כתום מקווקו (בולטת — רק באדום)', () => {
    const { container } = render(
      <ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} outsideIds={new Set([1, 2])} straddleIds={new Set([2])} />
    )
    expect(container.querySelector('[data-outside="1"]')).toBeInTheDocument()
    expect(container.querySelector('[data-outside="2"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-straddle="2"]')).toBeInTheDocument()
  })

  it('גלילה אל שורת-הסמן: כשהיא מחוץ לחלון — כן; מיד אחרי לחיצה על הסריקה — לא', () => {
    const h = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const had = Object.hasOwn(HTMLElement.prototype, 'scrollTo')
    const prev = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    try {
      const v = { ...view(), lines: [...view().lines, L(5, [520, 900, 900, 940]), L(6, [520, 800, 900, 840])] }
      const props = { view: v, imageUrl: '/p.png', mode: 'frames', frames, onClick: () => {} }
      const { rerender } = render(<ProofScan {...props} currentLineId={1} />)
      expect(scrollTo).not.toHaveBeenCalled() // גלויה
      rerender(<ProofScan {...props} currentLineId={5} />)
      expect(scrollTo).toHaveBeenCalledTimes(1)
      // הסמן זז בגלל לחיצה על הסריקה — לא גוללים
      down(svgOf(), 700, 120)
      up(svgOf(), 700, 120)
      rerender(<ProofScan {...props} currentLineId={6} />)
      expect(scrollTo).toHaveBeenCalledTimes(1)
    } finally {
      h.mockRestore()
      w.mockRestore()
      if (had) HTMLElement.prototype.scrollTo = prev
      else delete HTMLElement.prototype.scrollTo
    }
  })

  it('בחירה בגרירה במצב שורות ← onBand', () => {
    const onBand = vi.fn()
    render(<ProofScan view={view()} imageUrl="/p.png" mode="lines" onBand={onBand} />)
    down(svgOf(), 950, 80, { shiftKey: true })
    move(svgOf(), 500, 200)
    up(svgOf(), 500, 200)
    expect(onBand).toHaveBeenCalledWith([500, 80, 950, 200], true)
  })
})

describe('ProofScan — ידיות בצדדים', () => {
  const handlesOf = (container, sel) => [...container.querySelectorAll(`[data-handle]${sel}`)].map((h) => h.getAttribute('data-handle'))

  it('מסגרת נבחרת ושורה נבחרת: ידיות בארבע הפינות ובארבעת הצדדים, עם סמן-עכבר מתאים', () => {
    const { container, rerender } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" />)
    expect(handlesOf(container, '[data-fid="aa11bb"]').sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
    const n = container.querySelector('[data-handle="n"][data-fid="aa11bb"]')
    expect(n.getAttribute('class')).toContain('cursor-ns-resize')
    expect(container.querySelector('[data-handle="w"][data-fid="aa11bb"]').getAttribute('class')).toContain('cursor-ew-resize')
    // אמצע הצלע העליונה של [510, 90, 910, 200]
    expect(Number(n.getAttribute('x')) + Number(n.getAttribute('width')) / 2).toBe(710)
    rerender(<ProofScan view={view()} imageUrl="/p.png" mode="lines" selectedIds={[1]} resizeLineId={1} />)
    expect(handlesOf(container, '[data-line="1"]').sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
  })

  it('ידית-צלע משנה רק את הצלע שלה — במסגרת ובשורה', () => {
    const onFrameBox = vi.fn()
    const onLineBox = vi.fn()
    const { container, rerender } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" onFrameBox={onFrameBox} />)
    const e = container.querySelector('[data-handle="e"][data-fid="aa11bb"]')
    down(e, 910, 145)
    move(svgOf(), 960, 190)
    up(svgOf(), 960, 190)
    expect(onFrameBox).toHaveBeenLastCalledWith('aa11bb', [510, 90, 960, 200])
    const s = container.querySelector('[data-handle="s"][data-fid="aa11bb"]')
    down(s, 710, 200)
    move(svgOf(), 650, 260)
    up(svgOf(), 650, 260)
    expect(onFrameBox).toHaveBeenLastCalledWith('aa11bb', [510, 90, 910, 260])

    rerender(<ProofScan view={view()} imageUrl="/p.png" mode="lines" selectedIds={[1]} resizeLineId={1} onLineBox={onLineBox} />)
    const w = container.querySelector('[data-handle="w"][data-line="1"]')
    down(w, 520, 120)
    move(svgOf(), 450, 135)
    up(svgOf(), 450, 135)
    expect(onLineBox).toHaveBeenCalledWith(1, [450, 100, 900, 140])
  })

  it('שורה ומסגרת דקות בזום קטן (פחות מ-8 פיקסלי-מסך בגובה): ידית-צלע והזזה עדיין עובדות', () => {
    // בזום 0.2: 30 פיקסלי-תמונה = 6 פיקסלי-מסך. קודם כל גרירה כזו נזרקה בשקט
    const thin = { ...view(), lines: [L(1, [100, 200, 900, 230]), ...view().lines.slice(1)] }
    const onLineBox = vi.fn()
    const onFrameBox = vi.fn()
    const { container, rerender } = render(<ProofScan view={thin} imageUrl="/p.png" zoom={0.2} mode="lines" selectedIds={[1]} resizeLineId={1} onLineBox={onLineBox} />)
    const e = container.querySelector('[data-handle="e"][data-line="1"]')
    down(e, 180, 43)
    move(svgOf(), 190, 43)
    up(svgOf(), 190, 43)
    expect(onLineBox).toHaveBeenCalledWith(1, [100, 200, 950, 230])
    // לכווץ אותה עד כמעט-אפס — לא
    const s = container.querySelector('[data-handle="s"][data-line="1"]')
    down(s, 100, 46)
    move(svgOf(), 100, 40.2)
    up(svgOf(), 100, 40.2)
    expect(onLineBox).toHaveBeenCalledTimes(1)
    // מסגרת של שורה אחת: הזזה
    const thinFrame = [{ fid: 'aa11bb', stream: 'main', bbox: [96, 196, 904, 234], order: 1 }]
    rerender(<ProofScan view={thin} imageUrl="/p.png" zoom={0.2} mode="frames" frames={thinFrame} selectedFid="aa11bb" onFrameBox={onFrameBox} />)
    down(svgOf(), 100, 43)
    move(svgOf(), 110, 43)
    up(svgOf(), 110, 43)
    expect(onFrameBox).toHaveBeenCalledWith('aa11bb', [146, 196, 954, 234])
  })

  it('לחיצה על ידית בלי גרירה — אינה לחיצה על המסגרת (שום דבר לא נפתח)', () => {
    const onClick = vi.fn()
    const onFrameBox = vi.fn()
    const { container } = render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" onClick={onClick} onFrameBox={onFrameBox} />)
    const se = container.querySelector('[data-handle="se"][data-fid="aa11bb"]')
    down(se, 910, 200)
    move(svgOf(), 912, 201)
    up(svgOf(), 912, 201)
    expect(onClick).not.toHaveBeenCalled()
    expect(onFrameBox).not.toHaveBeenCalled()
  })
})

describe('ProofScan — החלונית של המסגרת', () => {
  const pop = <div data-testid="pop">חלונית</div>

  it('ממוקמת מחוץ למסגרת (בצד שיש בו מקום), לא על הקווים והידיות', () => {
    render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" overlay={pop} overlayFor="aa11bb" />)
    const ov = screen.getByTestId('scan-overlay')
    expect(ov).toContainElement(screen.getByTestId('pop'))
    expect(ov.getAttribute('data-side')).toBe('left')
    expect(ov.style.visibility).toBe('visible')
    // המסגרת [510, 90, 910, 200]; החלונית (300 רוחב משוער) נגמרת 12 פיקסלים לפני הקו השמאלי
    expect(ov.style.left).toBe('198px')
    expect(ov.style.top).toBe('90px')
  })

  it('אין מקום לרוחב המלא לצד המסגרת — מצטמצמת לרוחב שיש שם (style.width), לא עולה על המסגרת', () => {
    // טור גבוה [250, 20, 760, 980] (אין מקום מעליו ומתחתיו): משמאל 232 פיקסלים, מימין 222 — פחות מ-300
    const wide = [{ fid: 'aa11bb', stream: 'main', bbox: [250, 20, 760, 980], order: 1 }]
    render(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={wide} selectedFid="aa11bb" overlay={pop} overlayFor="aa11bb" />)
    const ov = screen.getByTestId('scan-overlay')
    expect(ov.getAttribute('data-side')).toBe('left')
    expect(ov.style.width).toBe('232px')
    expect(parseFloat(ov.style.left) + 232).toBe(250 - 12)
    expect(ov.style.visibility).toBe('visible')
  })

  it('נעלמת בזמן הזזה/שינוי-גודל של המסגרת וחוזרת אחרי — בלי שהגרירה פותחת משהו', () => {
    const onFrameBox = vi.fn()
    const onClick = vi.fn()
    const { container, rerender } = render(
      <ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={frames} selectedFid="aa11bb" overlay={pop} overlayFor="aa11bb" onFrameBox={onFrameBox} onClick={onClick} />
    )
    const ov = () => screen.getByTestId('scan-overlay')
    const nw = container.querySelector('[data-handle="nw"][data-fid="aa11bb"]')
    down(nw, 510, 90)
    move(svgOf(), 480, 60)
    expect(ov().style.visibility).toBe('hidden')
    up(svgOf(), 480, 60)
    expect(onFrameBox).toHaveBeenCalledWith('aa11bb', [480, 60, 910, 200])
    expect(ov().style.visibility).toBe('visible')
    // הזזה
    down(svgOf(), 700, 150)
    move(svgOf(), 690, 170)
    expect(ov().style.visibility).toBe('hidden')
    up(svgOf(), 690, 170)
    expect(ov().style.visibility).toBe('visible')
    expect(onClick).not.toHaveBeenCalled()
    // אחרי שהמסגרת זזה (התצוגה מתעדכנת) — החלונית נמדדת מחדש לפי התיבה החדשה
    const moved = [{ ...frames[0], bbox: [100, 400, 500, 510] }, frames[1]]
    rerender(<ProofScan view={view()} imageUrl="/p.png" mode="frames" frames={moved} selectedFid="aa11bb" overlay={pop} overlayFor="aa11bb" onFrameBox={onFrameBox} />)
    expect(ov().getAttribute('data-side')).toBe('right')
    expect(ov().style.left).toBe(`${500 + 12}px`)
    expect(ov().style.top).toBe('400px')
  })
})

describe('ProofScan — המילה והשורה של הסמן', () => {
  const withWords = () => ({
    ...view(),
    size: [1000, 3000],
    lines: [
      L(1, [520, 100, 900, 140], {
        words: [
          { text: 'אחת', bbox: [800, 102, 900, 138] },
          { text: 'שתיים', bbox: [650, 0, 780, 0] },
          { text: 'שלוש' },
        ],
      }),
      L(2, [520, 150, 900, 190]),
      L(5, [520, 900, 900, 940], { words: [{ text: 'רחוקה', bbox: [700, 902, 900, 938] }] }),
      L(6, [520, 2950, 900, 2990]),
    ],
  })

  it('מדגישה את תיבת-המילה של הסמן — בשני המצבים; בלי מילה / בלי תיבה — בלי הדגשה', () => {
    const { container, rerender } = render(<ProofScan view={withWords()} imageUrl="/p.png" mode="frames" frames={frames} currentLineId={1} currentWord={0} />)
    const hl = () => container.querySelector('[data-testid="word-highlight"]')
    expect([hl().getAttribute('x'), hl().getAttribute('y'), hl().getAttribute('width'), hl().getAttribute('height')]).toEqual(['800', '102', '100', '36'])
    // תיבה שידוע לה רק הטווח האופקי — בגובה השורה
    rerender(<ProofScan view={withWords()} imageUrl="/p.png" mode="lines" currentLineId={1} currentWord={1} />)
    expect([hl().getAttribute('x'), hl().getAttribute('y'), hl().getAttribute('height')]).toEqual(['650', '100', '40'])
    rerender(<ProofScan view={withWords()} imageUrl="/p.png" mode="lines" currentLineId={1} currentWord={2} />)
    expect(hl()).toBeNull()
    rerender(<ProofScan view={withWords()} imageUrl="/p.png" mode="lines" currentLineId={1} currentWord={-1} />)
    expect(hl()).toBeNull()
    rerender(<ProofScan view={withWords()} imageUrl="/p.png" mode="lines" currentLineId={2} currentWord={0} />)
    expect(hl()).toBeNull()
  })

  it('caretY: רק המילה זזה באותה שורה — בלי יישור-מחדש; המילה נגללת לחלון רק כשאינה בו', () => {
    const h = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(3000)
    const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 100, right: 1000, bottom: 400, width: 1000, height: 300, x: 0, y: 100 })
    const had = Object.hasOwn(HTMLElement.prototype, 'scrollTo')
    const prev = HTMLElement.prototype.scrollTo
    // גלילה "מיידית": scrollTo מציב את scrollTop, כמו אחרי שהגלילה החלקה הסתיימה
    const scrollTo = vi.fn(function (o) {
      this.scrollTop = o.top
    })
    HTMLElement.prototype.scrollTo = scrollTo
    const now = vi.spyOn(Date, 'now')
    let t = 100000
    now.mockImplementation(() => t)
    try {
      const two = {
        ...withWords(),
        lines: [L(5, [520, 900, 900, 940], { words: [{ text: 'א', bbox: [800, 902, 900, 938] }, { text: 'ב', bbox: [600, 902, 780, 938] }] }), L(6, [520, 2950, 900, 2990])],
      }
      const props = { view: two, imageUrl: '/p.png', mode: 'frames', frames, onClick: () => {} }
      const { rerender } = render(<ProofScan {...props} currentLineId={5} currentWord={0} caretY={250} />)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 750, behavior: 'smooth' })
      // הקלדה: המילה הבאה באותה שורה, באותו גובה — היא בחלון: שום גלילה
      rerender(<ProofScan {...props} currentLineId={5} currentWord={1} caretY={250} />)
      expect(scrollTo).toHaveBeenCalledTimes(1)
      // המשתמש גלל את הסריקה למעלה (הגלגלת), ואחרי הפסקה ממשיך להקליד באותה שורה: המילה
      // מחוץ לחלון — נגללת אליה (למרכז), לא "נמשכת" חזרה ליישור
      const scroller = screen.getByTestId('proof-scan').firstElementChild
      scroller.scrollTop = 0
      fireEvent.wheel(scroller, { deltaY: -400 })
      t += 2000
      rerender(<ProofScan {...props} currentLineId={5} currentWord={0} caretY={250} />)
      expect(scrollTo).toHaveBeenCalledTimes(2)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 770, behavior: 'smooth' })
      // שורה אחרת — שוב יישור מול הסמן
      rerender(<ProofScan {...props} currentLineId={6} currentWord={-1} caretY={250} />)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 2700, behavior: 'smooth' })
    } finally {
      h.mockRestore()
      w.mockRestore()
      sh.mockRestore()
      sw.mockRestore()
      rect.mockRestore()
      now.mockRestore()
      if (had) HTMLElement.prototype.scrollTo = prev
      else delete HTMLElement.prototype.scrollTo
    }
  })

  it('caretY: ראש תיבת-השורה נגלל מול ראש השורה של הסמן — אבל לא בזמן שהמשתמש לוחץ/גולל את הסריקה', () => {
    const h = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(3000)
    const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 100, right: 1000, bottom: 400, width: 1000, height: 300, x: 0, y: 100 })
    const had = Object.hasOwn(HTMLElement.prototype, 'scrollTo')
    const prev = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    const now = vi.spyOn(Date, 'now')
    let t = 100000
    now.mockImplementation(() => t)
    try {
      const props = { view: withWords(), imageUrl: '/p.png', mode: 'frames', frames, onClick: () => {} }
      const { rerender } = render(<ProofScan {...props} currentLineId={5} currentWord={0} caretY={250} />)
      // ראש השורה (900) יעמוד 150 פיקסלים מראש החלון (250 − 100): גלילה ל-750; המילה כבר בחלון
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 750, behavior: 'smooth' })
      expect(scrollTo).toHaveBeenCalledTimes(1)
      // שורה בתחתית העמוד — קטום לטווח הגלילה (3000 − 300)
      rerender(<ProofScan {...props} currentLineId={6} currentWord={-1} caretY={250} />)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 2700, behavior: 'smooth' })
      // המשתמש לוחץ על הסריקה (גרירה/פס-הגלילה) — בזמן הלחיצה ומעט אחריה לא גוללים
      const scroller = screen.getByTestId('proof-scan').firstElementChild
      fireEvent.pointerDown(scroller, { pointerId: 2 })
      rerender(<ProofScan {...props} currentLineId={1} currentWord={0} caretY={200} />)
      fireEvent.pointerUp(window, { pointerId: 2 })
      t += 300
      rerender(<ProofScan {...props} currentLineId={1} currentWord={0} caretY={210} />)
      expect(scrollTo).toHaveBeenCalledTimes(2)
      // גלגלת — גם
      t += 5000
      fireEvent.wheel(scroller, { deltaY: 40 })
      rerender(<ProofScan {...props} currentLineId={2} currentWord={0} caretY={230} />)
      expect(scrollTo).toHaveBeenCalledTimes(2)
      // אחרי שקט — שוב עוקבת: הסמן מתחת לתחתית החלון — השורה בכל זאת כולה בחלון (שוליים 8)
      t += 1000
      rerender(<ProofScan {...props} currentLineId={5} currentWord={0} caretY={400} />)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 648, behavior: 'smooth' })
      expect(scrollTo).toHaveBeenCalledTimes(3)
    } finally {
      h.mockRestore()
      w.mockRestore()
      sh.mockRestore()
      sw.mockRestore()
      rect.mockRestore()
      now.mockRestore()
      if (had) HTMLElement.prototype.scrollTo = prev
      else delete HTMLElement.prototype.scrollTo
    }
  })
})
