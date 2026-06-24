import { useRef, useEffect, useState, useCallback } from 'react'

const ResizeHandle = ({ cursor, position, handle, onResize, zoom }) => (
  <div
    onMouseDown={(e) => onResize(e, handle)}
    className={`absolute w-3 h-3 bg-white border border-info-600 rounded-full z-20 hover:bg-info-100 ${position}`}
    style={{ cursor: cursor, transform: `scale(${100 / zoom})` }}
  />
)

export default function ImagePanel({
  thumbnailUrl,
  pageNumber,
  handleOCRSelection,
  isOcrProcessing,
  imageZoom,
  setImageZoom,
  isSelectionMode,
  selectionStart,
  selectionEnd,
  selectionRect,
  setSelectionStart,
  setSelectionEnd,
  setSelectionRect,
  layoutOrientation,
  imagePanelWidth,
  isResizing,
  handleResizeStart,
  rotation = 0,
  setRotation
}) {
  const imageContainerRef = useRef(null)
  const wrapperRef = useRef(null)
  const imageRef = useRef(null)
  
  const animationFrameRef = useRef(null)
  
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const startCoordsRef = useRef(null)
  const currentCoordsRef = useRef(null)

  const [isRotating, setIsRotating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [interactionMode, setInteractionMode] = useState(null)
  const [activeHandle, setActiveHandle] = useState(null)
  
  const dragStartRef = useRef({
    x: 0, y: 0, 
    rectX: 0, rectY: 0, 
    rectW: 0, rectH: 0
  })

  const updateSelection = useCallback((clientX, clientY) => {
    if (!interactionMode || !imageRef.current || !wrapperRef.current) return

    const containerRect = wrapperRef.current.getBoundingClientRect()
    const scale = imageZoom / 100
    
    const rawX = (clientX - containerRect.left) / scale
    const rawY = (clientY - containerRect.top) / scale

    const imgWidth = imageRef.current.clientWidth
    const imgHeight = imageRef.current.clientHeight

    const clampedPos = {
        x: Math.max(0, Math.min(rawX, imgWidth)),
        y: Math.max(0, Math.min(rawY, imgHeight))
    }

    currentCoordsRef.current = clampedPos

    if (interactionMode === 'create') {
        setSelectionEnd(clampedPos)
    }
    else if (interactionMode === 'move') {
        const deltaX = rawX - dragStartRef.current.x
        const deltaY = rawY - dragStartRef.current.y
        
        let newX = dragStartRef.current.rectX + deltaX
        let newY = dragStartRef.current.rectY + deltaY
        
        if (newX < 0) newX = 0
        if (newY < 0) newY = 0
        if (newX + dragStartRef.current.rectW > imgWidth) newX = imgWidth - dragStartRef.current.rectW;
        if (newY + dragStartRef.current.rectH > imgHeight) newY = imgHeight - dragStartRef.current.rectH;

        setSelectionRect({
            ...selectionRect,
            x: newX,
            y: newY,
            width: dragStartRef.current.rectW,
            height: dragStartRef.current.rectH
        })
    }
    else if (interactionMode === 'resize') {
        const currentX = clampedPos.x
        const currentY = clampedPos.y
        const start = dragStartRef.current
        
        let newX = start.rectX
        let newY = start.rectY
        let newW = start.rectW
        let newH = start.rectH
        
        if (activeHandle.includes('w')) {
            const rightEdge = start.rectX + start.rectW
            newX = currentX 
            newW = rightEdge - newX
        }
        if (activeHandle.includes('e')) { newW = currentX - start.rectX }
        if (activeHandle.includes('n')) { 
            const bottomEdge = start.rectY + start.rectH
            newY = currentY
            newH = bottomEdge - newY
        }
        if (activeHandle.includes('s')) { newH = currentY - start.rectY }

        if (newW < 10) { 
           if (activeHandle.includes('w')) newX = start.rectX + start.rectW - 10; 
           newW = 10; 
        }
        if (newH < 10) {
           if (activeHandle.includes('n')) newY = start.rectY + start.rectH - 10;
           newH = 10;
        }

        setSelectionRect({ x: newX, y: newY, width: newW, height: newH })
    }
  }, [interactionMode, imageZoom, activeHandle, selectionRect, setSelectionEnd, setSelectionRect])


  const handleMouseMove = (e) => {
    if (!interactionMode) return
    e.preventDefault()
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    
    handleAutoScroll(e.clientX, e.clientY) 
    updateSelection(e.clientX, e.clientY)
  }

  const handleScroll = () => {
      if (!animationFrameRef.current && interactionMode) {
          updateSelection(lastMousePosRef.current.x, lastMousePosRef.current.y)
      }
  }

  const handleAutoScroll = (clientX, clientY) => {
      const scrollContainer = imageContainerRef.current
      if (!scrollContainer) return

      const rect = scrollContainer.getBoundingClientRect()
      const threshold = 50
      const maxSpeed = 15
      
      let scrollX = 0
      let scrollY = 0
      
      if (clientY < rect.top + threshold) {
          scrollY = -Math.min(maxSpeed, (rect.top + threshold - clientY) / 2)
      } else if (clientY > rect.bottom - threshold) {
          scrollY = Math.min(maxSpeed, (clientY - (rect.bottom - threshold)) / 2)
      }

      if (clientX < rect.left + threshold) {
          scrollX = -Math.min(maxSpeed, (rect.left + threshold - clientX) / 2)
      } else if (clientX > rect.right - threshold) {
          scrollX = Math.min(maxSpeed, (clientX - (rect.right - threshold)) / 2)
      }

      if (scrollX === 0 && scrollY === 0) {
          if (animationFrameRef.current) {
              cancelAnimationFrame(animationFrameRef.current)
              animationFrameRef.current = null
          }
          return
      }

      
      if (!animationFrameRef.current) {
          const loop = () => {
              if (!scrollContainer || !interactionMode) return

              const currentX = lastMousePosRef.current.x
              const currentY = lastMousePosRef.current.y
              
              let dx = 0, dy = 0
              if (currentY < rect.top + threshold) dy = -maxSpeed
              else if (currentY > rect.bottom - threshold) dy = maxSpeed
              
              if (currentX < rect.left + threshold) dx = -maxSpeed
              else if (currentX > rect.right - threshold) dx = maxSpeed

              if (dx !== 0 || dy !== 0) {
                  scrollContainer.scrollLeft += dx
                  scrollContainer.scrollTop += dy
                  
                  updateSelection(currentX, currentY)
                  
                  animationFrameRef.current = requestAnimationFrame(loop)
              } else {
                  animationFrameRef.current = null
              }
          }
          animationFrameRef.current = requestAnimationFrame(loop)
      }
  }

  const handleMouseUp = () => {
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
    }
    
    if (interactionMode === 'create' && startCoordsRef.current && currentCoordsRef.current) {
      const start = startCoordsRef.current
      const end = currentCoordsRef.current

      const minX = Math.min(start.x, end.x)
      const maxX = Math.max(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const maxY = Math.max(start.y, end.y)
      
      const width = maxX - minX
      const height = maxY - minY

      if (width > 5 && height > 5) {
        setSelectionRect({ x: minX, y: minY, width, height })
      }
      
      setSelectionStart(null)
      setSelectionEnd(null)
      startCoordsRef.current = null
      currentCoordsRef.current = null
    }
    
    setInteractionMode(null)
    setActiveHandle(null)
  }

  const getSelectionCanvas = useCallback(() => {
    if (!selectionRect || !imageRef.current) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = imageRef.current
    const scale = img.naturalWidth / img.clientWidth
    canvas.width = selectionRect.width * scale
    canvas.height = selectionRect.height * scale
    ctx.translate(-selectionRect.x * scale, -selectionRect.y * scale)
    const centerX = img.naturalWidth / 2
    const centerY = img.naturalHeight / 2
    ctx.translate(centerX, centerY)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-centerX, -centerY)
    ctx.drawImage(img, 0, 0)
    return canvas
  }, [selectionRect, rotation])

  const copySelectedArea = useCallback(async () => {
    const canvas = getSelectionCanvas()
    if (!canvas) return
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return
        const item = new ClipboardItem({ "image/png": blob })
        await navigator.clipboard.write([item])
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      })
    } catch (err) { console.error('Copy failed', err) }
  }, [getSelectionCanvas])

  const downloadSelectedArea = useCallback(() => {
      const canvas = getSelectionCanvas()
      if (!canvas) return
      try {
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `crop-page-${pageNumber || 'image'}-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (err) { console.error('Download failed', err) }
  }, [getSelectionCanvas, pageNumber])

  // --- Start of Updated Code ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        if (selectionRect && !isOcrProcessing) {
          e.preventDefault()
          e.stopPropagation()
          handleOCRSelection()
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.key === 'c')) {
        if (selectionRect) {
          e.preventDefault(); e.stopPropagation(); copySelectedArea()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectionRect, copySelectedArea, handleOCRSelection, isOcrProcessing]) // הוספנו תלויות חדשות
  // --- End of Updated Code ---

  useEffect(() => {
    if (!isRotating) return
    const handleRotateMove = (e) => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const radians = Math.atan2(e.clientY - centerY, e.clientX - centerX)
      const degrees = radians * (180 / Math.PI)
      setRotation(degrees + 90)
    }
    const handleRotateUp = () => {
      setIsRotating(false)
      document.body.style.cursor = 'default'
    }
    document.addEventListener('mousemove', handleRotateMove)
    document.addEventListener('mouseup', handleRotateUp)
    return () => {
      document.removeEventListener('mousemove', handleRotateMove)
      document.removeEventListener('mouseup', handleRotateUp)
    }
  }, [isRotating, setRotation])

  const handleRotationStart = (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsRotating(true); document.body.style.cursor = 'grabbing';
  }
  const rotateLeft = (e) => { e.stopPropagation(); setRotation(prev => Math.round((prev - 0.1) * 10) / 10) }
  const rotateRight = (e) => { e.stopPropagation(); setRotation(prev => Math.round((prev + 0.1) * 10) / 10) }

  const getWrapperCoordinates = (e) => {
    if (!wrapperRef.current) return { x: 0, y: 0 }
    const containerRect = wrapperRef.current.getBoundingClientRect()
    const scale = imageZoom / 100
    return {
      x: (e.clientX - containerRect.left) / scale,
      y: (e.clientY - containerRect.top) / scale
    }
  }

  const handleMouseDownCreate = (e) => {
    if (isRotating || !isSelectionMode || e.target.closest('.rotation-controls')) return
    if (e.target.closest('.selection-box') || e.target.tagName === 'BUTTON') return

    e.preventDefault()
    e.stopPropagation()
    
    const coords = getWrapperCoordinates(e)
    
    if (imageRef.current) {
         coords.x = Math.max(0, Math.min(coords.x, imageRef.current.clientWidth))
         coords.y = Math.max(0, Math.min(coords.y, imageRef.current.clientHeight))
    }

    setSelectionStart(coords)
    setSelectionEnd(coords)
    startCoordsRef.current = coords
    currentCoordsRef.current = coords

    setSelectionRect(null) 
    setInteractionMode('create')
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseDownMove = (e) => {
    if (!selectionRect) return
    e.preventDefault()
    e.stopPropagation()
    const coords = getWrapperCoordinates(e)
    dragStartRef.current = {
      x: coords.x, y: coords.y,
      rectX: selectionRect.x, rectY: selectionRect.y,
      rectW: selectionRect.width, rectH: selectionRect.height
    }
    setInteractionMode('move')
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseDownResize = (e, handle) => {
    e.preventDefault()
    e.stopPropagation()
    const coords = getWrapperCoordinates(e)
    dragStartRef.current = {
      x: coords.x, y: coords.y,
      rectX: selectionRect.x, rectY: selectionRect.y,
      rectW: selectionRect.width, rectH: selectionRect.height
    }
    setActiveHandle(handle)
    setInteractionMode('resize')
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }

  useEffect(() => {
    const container = imageContainerRef.current
    if (!container) return

    const handleWheelZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()

        const delta = e.deltaY > 0 ? -10 : 10 
        
        if (typeof setImageZoom === 'function') {
            setImageZoom(prevZoom => {
                const current = Number(prevZoom) || 100 
                const newZoom = current + delta
                return Math.max(10, Math.min(newZoom, 500))
            })
        } else {
            console.error("setImageZoom prop is missing or not a function!");
        }
      }
    }

    container.addEventListener('wheel', handleWheelZoom, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheelZoom)
    }
  }, [setImageZoom])

  useEffect(() => {
    const onMove = (e) => handleMouseMove(e)
    const onUp = (e) => handleMouseUp(e)

    if (interactionMode) {
      window.addEventListener('mousemove', onMove, { passive: false })
      window.addEventListener('mouseup', onUp)
    }

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  // מטפלי אירוע נוצרים מחדש בכל רינדור; מוחרגים למניעת קשירה חוזרת
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionMode, selectionRect, selectionStart, activeHandle, rotation]) 

  return (
    <>
      <div
        ref={imageContainerRef}
        onScroll={handleScroll} 
        className="overflow-auto p-4 bg-neutral-50/50 relative block select-none"
        style={{
          width: layoutOrientation === 'horizontal' ? '100%' : `${imagePanelWidth}%`,
          height: layoutOrientation === 'horizontal' ? `${imagePanelWidth}%` : 'auto',
          flexShrink: 0
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {thumbnailUrl ? (
          <div 
            className="relative mx-auto flex items-center justify-center min-h-full"
            style={{ width: 'fit-content', paddingBottom: '40px' }}
          >
            <div
              ref={wrapperRef}
              className="inline-block relative transition-transform duration-75 ease-linear group select-none"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onMouseDown={handleMouseDownCreate} 
              style={{ 
                zoom: `${imageZoom}%`,
                cursor: isSelectionMode ? 'crosshair' : 'default',
                transformOrigin: 'center center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none'
              }}
            >
              <div 
                style={{ 
                    transform: `rotate(${rotation}deg)`, 
                    transition: isRotating ? 'none' : 'transform 0.1s ease-out',
                    position: 'relative'
                }}
              >
                  <div className="rotation-controls absolute top-2 left-1/2 flex items-center gap-2 z-[100] opacity-0 group-hover:opacity-100 transition-opacity"
                       style={{ transform: `translateX(-50%) scale(${100 / imageZoom})` }}>
                     <button className="w-4 h-4 bg-neutral-600/90 border border-neutral-100 text-white rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm" onMouseDown={rotateRight}>&lt;</button>
                     <div className="rotation-handle relative w-8 h-8 bg-neutral-800/90 border border-neutral-600 rounded-full flex items-center justify-center cursor-grab backdrop-blur-sm" onMouseDown={handleRotationStart}>
                        <span className="material-symbols-outlined text-white text-sm">sync</span>
                        {(isRotating || rotation !== 0) && (
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap dir-ltr shadow-md border border-neutral-700">
                            {Number(rotation).toFixed(1)}°
                          </div>
                        )}
                     </div>
                     <button className="w-4 h-4 bg-neutral-600/90 border border-neutral-100 text-white rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm" onMouseDown={rotateLeft}>&gt;</button>
                  </div>

                  <img
                    ref={imageRef}
                    src={thumbnailUrl}
                    alt={`עמוד ${pageNumber}`}
                    className="rounded-lg shadow-lg block select-none"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ maxWidth: 'none', pointerEvents: 'none', userSelect: 'none' }}
                  />
              </div>
              
              {interactionMode === 'create' && selectionStart && selectionEnd && (
                <div
                  className="absolute border-2 border-info-500 bg-info-500/20 pointer-events-none"
                  style={{
                    left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
                    top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
                    width: `${Math.abs(selectionStart.x - selectionEnd.x)}px`,
                    height: `${Math.abs(selectionStart.y - selectionEnd.y)}px`
                  }}
                />
              )}

              {selectionRect && (
                <div
                  className="selection-box absolute border-2 border-success-500 bg-success-500/10 group/box"
                  style={{
                    left: `${selectionRect.x}px`,
                    top: `${selectionRect.y}px`,
                    width: `${selectionRect.width}px`,
                    height: `${selectionRect.height}px`,
                    cursor: 'move'
                  }}
                  onMouseDown={handleMouseDownMove}
                >
                  <ResizeHandle cursor="nw-resize" position="-top-1.5 -left-1.5" handle="nw" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="n-resize" position="-top-1.5 left-1/2 -translate-x-1/2" handle="n" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="ne-resize" position="-top-1.5 -right-1.5" handle="ne" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="e-resize" position="top-1/2 -translate-y-1/2 -right-1.5" handle="e" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="se-resize" position="-bottom-1.5 -right-1.5" handle="se" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="s-resize" position="-bottom-1.5 left-1/2 -translate-x-1/2" handle="s" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="sw-resize" position="-bottom-1.5 -left-1.5" handle="sw" onResize={handleMouseDownResize} zoom={imageZoom} />
                  <ResizeHandle cursor="w-resize" position="top-1/2 -translate-y-1/2 -left-1.5" handle="w" onResize={handleMouseDownResize} zoom={imageZoom} />

                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); downloadSelectedArea(); }}
                    className="absolute bottom-0 right-[72px] translate-y-full mt-1 bg-info-600 hover:bg-info-700 text-white flex items-center justify-center p-1 rounded shadow-md pointer-events-auto transition-colors z-30"
                    title="הורד בחירה"
                    style={{ transform: `scale(${100 / imageZoom})`, transformOrigin: 'top right', cursor: 'pointer' }}
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </button>

                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); copySelectedArea(); }}
                    className="absolute bottom-0 right-9 translate-y-full mt-1 bg-info-600 hover:bg-info-700 text-white flex items-center justify-center p-1 rounded shadow-md pointer-events-auto transition-colors z-30"
                    title="העתק תמונה (Ctrl+C)"
                    style={{ transform: `scale(${100 / imageZoom})`, transformOrigin: 'top right', cursor: 'pointer' }}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                        {isCopied ? 'check' : 'content_copy'}
                    </span>
                  </button>

                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); handleOCRSelection(); }}
                    disabled={isOcrProcessing}
                    className="absolute bottom-0 right-0 translate-y-full mt-1 bg-success-600 hover:bg-success-700 text-white flex items-center justify-center p-1 rounded shadow-md pointer-events-auto transition-colors disabled:opacity-50 z-30"
                    title="זהה טקסט"
                    style={{ transform: `scale(${100 / imageZoom})`, transformOrigin: 'top right', cursor: 'pointer' }}
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isOcrProcessing ? 'animate-spin' : ''}`}>
                      {isOcrProcessing ? 'progress_activity' : 'check'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-full bg-surface rounded-lg w-full">
            <p className="text-on-surface/60">אין תמונה זמינה</p>
          </div>
        )}
      </div>
      
      <div
        className={`relative flex items-center justify-center hover:bg-primary/10 transition-colors ${layoutOrientation === 'horizontal' ? 'cursor-row-resize' : 'cursor-col-resize'}`}
        style={{
          width: layoutOrientation === 'horizontal' ? '100%' : '8px',
          height: layoutOrientation === 'horizontal' ? '8px' : 'auto',
          backgroundColor: isResizing ? 'rgba(107, 93, 79, 0.2)' : 'transparent',
          flexShrink: 0,
          zIndex: 50
        }}
        onMouseDown={handleResizeStart}
      >
         <div className="absolute bg-surface-variant rounded-full" style={{ width: layoutOrientation === 'horizontal' ? '32px' : '4px', height: layoutOrientation === 'horizontal' ? '4px' : '32px' }}></div>
      </div>
    </>
  )
}