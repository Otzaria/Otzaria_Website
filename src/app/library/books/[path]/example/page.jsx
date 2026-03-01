'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import ImagePanel from '@/components/editor/ImagePanel'

export default function ExamplePageViewer() {
  const params = useParams()
  const bookPath = decodeURIComponent(params.path)
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  
  const [imageZoom, setImageZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [imagePanelWidth, setImagePanelWidth] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const splitContainerRef = useRef(null)

  useEffect(() => {
    const fetchExample = async () => {
      try {
        const res = await fetch(`/api/book/${encodeURIComponent(bookPath)}/example`)
        const result = await res.json()
        
        if (result.success) {
          setData(result)
        } else {
          setError(result.error)
        }
      } catch (err) {
        setError('שגיאה בטעינת הדף')
      } finally {
        setLoading(false)
      }
    }
    fetchExample()
  }, [bookPath])

  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }
  
  const handleMouseMove = (e) => {
    if (isResizing && splitContainerRef.current) {
      const rect = splitContainerRef.current.getBoundingClientRect()
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100
      setImagePanelWidth(Math.min(Math.max(newWidth, 20), 80))
    }
  }
  
  const handleMouseUp = () => {
    setIsResizing(false)
  }

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <span className="material-symbols-outlined animate-spin text-5xl text-blue-600">progress_activity</span>
        <p className="text-gray-600 font-medium">טוען עמוד דוגמא...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
            <span className="material-symbols-outlined text-6xl text-red-500 mb-4">error_outline</span>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">שגיאה</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <button 
                onClick={() => window.close()} 
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
                סגור חלונית
            </button>
        </div>
      </div>
    )
  }

  const { twoColumns, rightColumn, leftColumn, content, rightColumnName, leftColumnName } = data.text;

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden" dir="rtl">
      
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
                <span className="material-symbols-outlined text-indigo-600">bookmark</span>
            </div>
            <div>
                <h1 className="text-lg font-bold text-gray-900">{data.bookName}</h1>
                <p className="text-xs text-gray-500 font-medium">עמוד דוגמא: {data.pageNumber} (מצב צפייה בלבד)</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
             <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-4 border border-gray-200">
                <button onClick={() => setImageZoom(z => Math.max(z - 10, 10))} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all">
                    <span className="material-symbols-outlined text-sm">remove</span>
                </button>
                <span className="text-xs font-mono w-10 text-center">{imageZoom}%</span>
                <button onClick={() => setImageZoom(z => Math.min(z + 10, 300))} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all">
                    <span className="material-symbols-outlined text-sm">add</span>
                </button>
            </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-4">
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex overflow-hidden" ref={splitContainerRef}>
            
            <ImagePanel 
                thumbnailUrl={data.image}
                pageNumber={data.pageNumber}
                imageZoom={imageZoom}
                setImageZoom={setImageZoom}
                imagePanelWidth={imagePanelWidth}
                isResizing={isResizing}
                handleResizeStart={handleResizeStart}
                rotation={rotation}
                setRotation={setRotation}
                isSelectionMode={false} 
                selectionRect={null}
                isOcrProcessing={false}
            />

            <div 
                className="flex flex-col h-full bg-gray-50 overflow-hidden relative"
                style={{ width: `${100 - imagePanelWidth}%` }}
            >
                 <div className="absolute inset-0 overflow-y-auto p-4 custom-scrollbar">
                    <div className="bg-white shadow-sm border border-gray-100 min-h-full rounded-lg flex flex-col">
                        {twoColumns ? (
                            <div className="flex gap-0 h-full divide-x divide-x-reverse divide-gray-200">
                                <div className="flex-1 p-4">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                                        <span className="material-symbols-outlined text-gray-400 text-sm">article</span>
                                        <span className="text-sm font-bold text-gray-700">{rightColumnName || 'חלק 1'}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-800">
                                        {rightColumn || ''}
                                    </div>
                                </div>
                                <div className="flex-1 p-4">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                                        <span className="material-symbols-outlined text-gray-400 text-sm">article</span>
                                        <span className="text-sm font-bold text-gray-700">{leftColumnName || 'חלק 2'}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-800">
                                        {leftColumn || ''}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-800">
                                {content || 'אין תוכן זמין לעמוד זה'}
                            </div>
                        )}
                    </div>
                 </div>
                 
                 <div className="absolute bottom-4 left-4 pointer-events-none opacity-30 z-20">
                    <span className="text-6xl font-black text-gray-300 select-none rotate-[-15deg] block border-4 border-gray-300 p-4 rounded-xl">
                        דוגמא
                    </span>
                 </div>
            </div>

        </div>
      </div>
    </div>
  )
}