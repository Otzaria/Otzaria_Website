'use client'

import { useState, useRef, useCallback } from 'react'
import { useDialog } from '@/components/DialogContext'

export default function EmbedImageModal({ isOpen, onClose, content, onContentChange }) {
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

    const newContent = content + '\n' + htmlCode
    onContentChange(newContent)
    showAlert('הצלחה', 'התמונה הוכנסה לעורך!')
    handleClose()
  }, [htmlCode, content, onContentChange, showAlert, handleClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPaste={handlePaste}
        tabIndex={0}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-800">המרת תמונה לטקסט HTML</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!isConverted ? (
            <>
              <div className="text-center mb-4">
                <p className="text-gray-600 text-lg">בחר תמונה להמרה</p>
                <p className="text-gray-500 text-sm mt-1">גרור קובץ, לחץ לבחירה, או הדבק תמונה (Ctrl+V)</p>
              </div>

              {/* אזור גרירה וקליק */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-16 text-center transition-all cursor-pointer ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50 scale-105' 
                    : imageData 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
              >
                <span className="material-symbols-outlined text-6xl text-gray-400 mb-3 block">
                  {imageData ? 'check_circle' : 'cloud_upload'}
                </span>
                <p className="text-xl text-gray-700 font-medium mb-1">
                  {imageData ? 'התמונה נטענה בהצלחה!' : 'לחץ לבחירת קובץ'}
                </p>
                <p className="text-sm text-gray-500">
                  {!imageData && 'או גרור ושחרר קובץ תמונה כאן'}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.tif,.tiff,.heic,.heif,.ico,.webp,.gif,.bmp"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />

              {/* כפתור המרה */}
              <button
                onClick={handleConvert}
                disabled={!imageData}
                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-xl font-bold"
              >
                המר
              </button>
            </>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                  <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
                </div>
                <p className="text-xl font-bold text-gray-800">ההמרה בוצעה בהצלחה!</p>
              </div>

              {/* תצוגה מקדימה של התמונה */}
              {imageData && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-gray-600">תצוגה מקדימה:</p>
                    {imageData.compressedSize && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                        {imageData.compressedSize} KB
                      </span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <img 
                      src={imageData.data} 
                      alt="Preview" 
                      className="max-w-full max-h-64 object-contain rounded"
                    />
                  </div>
                </div>
              )}

              {/* כפתורים */}
              <div className="space-y-3">
                <button
                  onClick={handleInsertToEditor}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  <span>הוסף לעורך</span>
                </button>

                <button
                  onClick={handleCopyToClipboard}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">content_copy</span>
                  <span>העתק קוד HTML</span>
                </button>

                <button
                  onClick={resetState}
                  className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">refresh</span>
                  <span>המרת תמונה נוספת</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
