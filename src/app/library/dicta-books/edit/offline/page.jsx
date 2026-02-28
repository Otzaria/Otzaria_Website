'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Button from '@/components/Button'
import DictaEditorCore from '@/components/editor/DictaEditorCore'

export default function OfflineEditorRoute() {
  const [localContent, setLocalContent] = useState('')
  const [fileName, setFileName] = useState('קובץ_מקומי_חדש.txt')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const fileInputRef = useRef(null)

  // טעינת תוכן מ-localStorage אם קיים (מהעלאות)
  useEffect(() => {
    const tempContent = localStorage.getItem('tempEditorContent');
    const tempFileName = localStorage.getItem('tempEditorFileName');
    
    if (tempContent) {
      setLocalContent(tempContent);
      setHasUnsavedChanges(false);
      
      // ניקוי localStorage
      localStorage.removeItem('tempEditorContent');
    }
    
    if (tempFileName) {
      setFileName(tempFileName);
      localStorage.removeItem('tempEditorFileName');
    }
  }, []);

  // התראה בעת ניסיון לעזוב את הדף עם שינויים שלא נשמרו
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // פתיחת קובץ מהמחשב של המשתמש
  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      setLocalContent(e.target.result)
      setHasUnsavedChanges(false)
    }
    reader.readAsText(file)
  }

  // שמירת העריכה כקובץ חדש במחשב
  const handleSaveToLocalFile = (currentContent) => {
    const blob = new Blob([currentContent], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    setLocalContent(currentContent)
    setHasUnsavedChanges(false)
  }

  // אלמנטים ייעודיים לצד ימין של ההדר (כולל כפתור פתיחת קובץ)
  const headerStart = (
    <>
      <Link href="/library" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="לוגו אוצריא" className="w-10 h-10" />
        <span className="text-lg font-bold text-black" style={{ fontFamily: 'FrankRuehl, serif' }}>ספריית אוצריא</span>
      </Link>
      <div className="w-px h-8 bg-surface-variant"></div>
      
      <input 
        type="file" 
        accept=".txt,.html" 
        style={{ display: 'none' }} 
        ref={fileInputRef}
        onChange={handleFileUpload} 
      />
      <Button 
        icon="folder_open" 
        variant="ghost" 
        onClick={() => fileInputRef.current?.click()} 
        label="פתח קובץ מקומי" 
      />
      <div className="w-px h-8 bg-surface-variant mx-2"></div>
    </>
  )

  // אלמנטים ייעודיים לצד שמאל של ההדר
  const headerEnd = (
    <div className="flex items-center gap-4">
      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
        עורך מקומי (לא נשמר לשרת)
      </span>
    </div>
  )

  return (
    <DictaEditorCore 
      initialContent={localContent}
      title={fileName}
      canEdit={true}
      isCompleted={false}
      onSave={handleSaveToLocalFile}
      hasUnsavedChangesOuter={hasUnsavedChanges}
      setHasUnsavedChanges={setHasUnsavedChanges}
      headerStartElement={headerStart}
      headerEndElement={headerEnd}
    />
  )
}