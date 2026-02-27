'use client'

import { useState, useRef } from 'react'
import Button from '@/components/Button'
import DictaEditorCore from '@/components/editor/DictaEditorCore'

export default function OfflineDictaApp() {
  const [localContent, setLocalContent] = useState('')
  const [fileName, setFileName] = useState('קובץ_אופליין_חדש.txt')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const fileInputRef = useRef(null)

  // פתיחת קובץ מקומי
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

  // שמירה מקומית על ידי הורדה
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

  const headerStart = (
    <>
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
        onClick={() => fileInputRef.current.click()} 
        label="פתח קובץ מקומי" 
      />
      <div className="w-px h-8 bg-surface-variant mx-2"></div>
    </>
  )

  const headerEnd = (
    <div className="text-sm text-gray-500 font-medium">
      מצב עבודה אופליין
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