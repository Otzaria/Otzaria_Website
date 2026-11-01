'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

// onInsert(html) — אם ניתן, ההכנסה בידי המארח (למשל במקום הסמן בשדה הפעיל); אחרת — בסוף content
export default function EmbedImageModal({ isOpen, onClose, content, onContentChange, onInsert }) {
  const { showAlert } = useDialog()
  const [imageData, setImageData] = useState(null)
  const [htmlCode, setHtmlCode] = useState('')
  const [isConverted, setIsConverted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const resetState = useCallback(() => {
    setImageData(null)
    setHtmlCode('')
    setIsConverted(false)
    setIsDragging(false)
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [onClose, resetState])

  const compressImage = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // הגדרות קבועות לדחיסה בסיסית
          const maxSize = 600 // גודל מקסימלי קטן למשרטוטים
          const quality = 0.7 // איכות בסיסית 70%
          
          let width = img.width
          let height = img.height
          
          // שמירה על יחס התמונה
          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height
              height = maxSize
            }
          }
          
          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          
          // המרה ל-JPEG עם דחיסה בסיסית
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
          
          // חישוב גודל
          const originalSize = (e.target.result.length * 0.75) / 1024
          const compressedSize = (compressedDataUrl.length * 0.75) / 1024
          
          resolve({
            data: compressedDataUrl,
            extension: 'jpg',
            originalSize: originalSize.toFixed(0),
            compressedSize: compressedSize.toFixed(0)
          })
        }
        
        img.onerror = () => reject(new Error('שגיאה בטעינת התמונה'))
        img.src = e.target.result
      }
      
      reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'))
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileSelect = useCallback(async (files) => {
    if (!files || files.length === 0) return

    const supportedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.tif', '.tiff', '.heic', '.heif', '.ico', '.webp', '.gif', '.bmp']
    const file = files[0]
    const fileName = file.name.toLowerCase()
    
    const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext))
    
    if (!isSupported) {
      showAlert('שגיאה', 'הסיומת של הקובץ אינה נתמכת')
      return
    }

    try {
      // דחיסת התמונה
      const compressed = await compressImage(file)
      setImageData(compressed)
      showAlert('הצלחה', 'התמונה נטענה ודוחסה!')
    } catch (error) {
      showAlert('שגיאה', `שגיאה בעיבוד התמונה: ${error.message}`)
    }
  }, [showAlert, compressImage])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    handleFileSelect(files)
  }, [handleFileSelect])

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      // בדיקה אם מדובר בתמונה
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile()
        if (file) {
          handleFileSelect([file])
        }
        return
      }
    }
  }, [handleFileSelect])

  const handleConvert = useCallback(async () => {
    if (!imageData) {
      showAlert('שגיאה', 'לא נמצאה תמונה להמרה')
      return
    }

    // יצירת קוד HTML
    const html = `<img src="${imageData.data}" alt="תמונה">`
    setHtmlCode(html)
    setIsConverted(true)
    showAlert('הצלחה', 'ההמרה בוצעה בהצלחה!')
  }, [imageData, showAlert])

  const handleCopyToClipboard = useCallback(() => {
    if (!htmlCode) return

    navigator.clipboard.writeText(htmlCode).then(() => {
      showAlert('הצלחה', 'הטקסט הועתק ללוח!')
    }).catch(() => {
      showAlert('שגיאה', 'לא ניתן להעתיק ללוח')
    })
  }, [htmlCode, showAlert])

  const handleInsertToEditor = useCallback(() => {
    if (!htmlCode) return

    if (onInsert) onInsert(htmlCode)
    else onContentChange(content + '\n' + htmlCode)
    showAlert('הצלחה', 'התמונה הוכנסה לעורך!')
    handleClose()
  }, [htmlCode, content, onContentChange, onInsert, showAlert, handleClose])

  // הדבקת תמונה (Ctrl+V) כשהחלון פתוח — מאזין על המסמך: הפוקוס יכול להיות על החלון עצמו או על כל פקד בו
  useEffect(() => {
    if (!isOpen) return undefined
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [isOpen, handlePaste])

  if (!isOpen) return null

  return (
    <Dialog
      title="המרת תמונה לקוד HTML"
      subtitle={isConverted ? undefined : 'גרור קובץ, לחץ לבחירה, או הדבק תמונה (Ctrl+V)'}
      onClose={handleClose}
      className="sm:max-w-2xl"
    >
      <div className="space-y-4">
        {!isConverted ? (
          <>
            {/* אזור גרירה ובחירה */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cx(
                'flex w-full flex-col items-center rounded-(--radius-card) border-2 border-dashed px-6 py-12 text-center transition-colors',
                FOCUS_RING,
                isDragging
                  ? 'border-primary bg-surface-selected'
                  : imageData
                    ? 'border-primary bg-surface'
                    : 'border-outline bg-surface hover:bg-surface-container'
              )}
            >
              <AppIcon name={imageData ? 'check_circle' : 'cloud_upload'} className="mb-3 text-5xl text-primary" />
              <span className="text-title-md text-on-surface">
                {imageData ? 'התמונה נטענה' : 'לחץ לבחירת קובץ'}
              </span>
              {!imageData && <span className="mt-1 text-body-sm text-on-surface-variant">או גרור ושחרר קובץ תמונה לכאן</span>}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg,.tif,.tiff,.heic,.heif,.ico,.webp,.gif,.bmp"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <Button variant="filled" size="lg" fullWidth onClick={handleConvert} disabled={!imageData}>
              המרה
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <AppIcon name="check_circle" className="text-5xl text-primary" />
              <p className="mt-2 text-title-md text-on-surface">ההמרה בוצעה</p>
            </div>

            {imageData && (
              <div className="rounded-(--radius-card) border border-outline-variant bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-body-sm text-on-surface-variant">תצוגה מקדימה</p>
                  {imageData.compressedSize && (
                    <span className="rounded-(--radius-pill) bg-surface-container-high px-2 py-0.5 text-label-md text-on-surface-variant">
                      <bdi dir="ltr">{imageData.compressedSize} KB</bdi>
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  <img src={imageData.data} alt="תצוגה מקדימה של התמונה" className="max-h-64 max-w-full rounded-(--radius-control) object-contain" />
                </div>
              </div>
            )}

            <div className="grid gap-3">
              <Button variant="filled" icon="add_circle" fullWidth onClick={handleInsertToEditor}>הוספה לעורך</Button>
              <Button variant="tonal" icon="content_copy" fullWidth onClick={handleCopyToClipboard}>העתקת קוד ה-HTML</Button>
              <Button variant="outlined" icon="refresh" fullWidth onClick={resetState}>המרת תמונה נוספת</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
