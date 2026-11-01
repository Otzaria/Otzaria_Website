import { useRef, useEffect, useState, useCallback } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

export default function ImagePanel({
  thumbnailUrl,
  pageNumber,
  imageZoom,
  setImageZoom,
  layoutOrientation,
  imagePanelWidth,
  isResizing,
  handleResizeStart,
  // רשות (עורך העמוד החדש): renderOverlay({ naturalWidth, naturalHeight, zoom })
  // — שכבה בפיקסלים הטבעיים של התמונה, בתוך העטיפה המוגדלת (הזום חל עליה);
  // scrollRef — מקבל את מכל הגלילה (למעקב הגלילה אחרי הסמן). בלעדיהם — בדיוק כמו קודם.
  renderOverlay,
  scrollRef,
  // false — המפריד מצויר מבחוץ (EditorShell / PanelSplitter בעורך החדש)
  showSplitter = true,
  // רשות: נקרא כשהצילום נטען (למשל התאמה לרוחב בכניסה הראשונה)
  onImageLoad
}) {
  const imageContainerRef = useRef(null)
  const [naturalSize, setNaturalSize] = useState(null)
  const setContainerRef = useCallback((el) => {
    imageContainerRef.current = el
    if (scrollRef) scrollRef.current = el
  }, [scrollRef])
  // הממדים נשמרים תמיד (גם לפני שהשכבה הגיעה — המקור שלה נטען במקביל לתמונה)
  const handleImageLoad = useCallback((e) => {
    const img = e.currentTarget
    setNaturalSize((prev) => (prev && prev[0] === img.naturalWidth && prev[1] === img.naturalHeight ? prev : [img.naturalWidth, img.naturalHeight]))
    onImageLoad?.()
  }, [onImageLoad])
  // צילום שלא נטען (404, רשת) — מצב ריק עם "נסה שוב" במקום אייקון תמונה שבורה.
  // נשמרת הכתובת שנכשלה: מעבר לעמוד אחר (כתובת אחרת) מאפס את המצב בלי אפקט.
  const [failedUrl, setFailedUrl] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  const imageFailed = Boolean(thumbnailUrl) && failedUrl === thumbnailUrl
  // תמונה שנטענה לפני שהמאזין חובר (מטמון) — לקרוא את הממדים ישירות
  useEffect(() => {
    const img = imageRef.current
    if (!renderOverlay || !img || !img.complete || !(img.naturalWidth > 0)) return
    setNaturalSize((prev) => (prev && prev[0] === img.naturalWidth && prev[1] === img.naturalHeight ? prev : [img.naturalWidth, img.naturalHeight]))
  }, [renderOverlay, thumbnailUrl])
  const imageRef = useRef(null)

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

  return (
    <>
      <div
        ref={setContainerRef}
        className="group/scan overflow-auto p-4 bg-surface-container-low/50 relative block select-none"
        style={{
          width: layoutOrientation === 'horizontal' ? '100%' : `${imagePanelWidth}%`,
          height: layoutOrientation === 'horizontal' ? `${imagePanelWidth}%` : 'auto',
          flexShrink: 0
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {imageFailed ? (
          <EmptyState
            tone="plain"
            role="alert"
            as="h3"
            icon="image"
            title="הצילום לא נטען"
            description="ייתכן שיש בעיה בחיבור או בשרת."
            className="min-h-full justify-center"
            actions={<Button variant="tonal" icon="refresh" onClick={() => { setFailedUrl(null); setRetryKey((k) => k + 1) }}>נסה שוב</Button>}
          />
        ) : thumbnailUrl ? (
          <div 
            className="relative mx-auto flex items-center justify-center min-h-full"
            style={{ width: 'fit-content', paddingBottom: '40px' }}
          >
            <div
              className="inline-block relative transition-transform duration-75 ease-linear group select-none"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              style={{ 
                zoom: `${imageZoom}%`,
                transformOrigin: 'center center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none'
              }}
            >
              <div style={{ position: 'relative' }}>
                  <img
                    key={retryKey}
                    ref={imageRef}
                    src={thumbnailUrl}
                    alt={`עמוד ${pageNumber}`}
                    className="rounded-lg shadow-lg block select-none"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ maxWidth: 'none', pointerEvents: 'none', userSelect: 'none' }}
                    onLoad={handleImageLoad}
                    onError={() => setFailedUrl(thumbnailUrl)}
                  />
                  {renderOverlay && naturalSize && renderOverlay({
                    naturalWidth: naturalSize[0],
                    naturalHeight: naturalSize[1],
                    zoom: imageZoom / 100
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-full bg-surface rounded-lg w-full">
            <p className="text-body-md text-on-surface-variant">אין תמונה זמינה</p>
          </div>
        )}
      </div>
      
      {showSplitter && <div
        className={`relative flex items-center justify-center hover:bg-primary/10 transition-colors ${layoutOrientation === 'horizontal' ? 'cursor-row-resize' : 'cursor-col-resize'}`}
        style={{
          width: layoutOrientation === 'horizontal' ? '100%' : '8px',
          height: layoutOrientation === 'horizontal' ? '8px' : 'auto',
          backgroundColor: isResizing ? 'color-mix(in srgb, var(--color-outline) 20%, transparent)' : 'transparent',
          flexShrink: 0,
          zIndex: 50
        }}
        onMouseDown={handleResizeStart}
      >
         <div className="absolute bg-surface-variant rounded-full" style={{ width: layoutOrientation === 'horizontal' ? '32px' : '4px', height: layoutOrientation === 'horizontal' ? '4px' : '32px' }}></div>
      </div>}
    </>
  )
}
