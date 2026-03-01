// src/app/library/upload/page.jsx
'use client'

import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useDialog } from '@/components/DialogContext'

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showConfirm, showAlert } = useDialog()
  
  const [file, setFile] = useState(null)
  const [bookName, setBookName] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  if (status === 'unauthenticated') {
    router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
    return null
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      // מציע שם ספר לפי שם הקובץ
      if (!bookName) {
        const nameWithoutExt = selectedFile.name.replace(/\.(txt|doc|docx|rtf|odt)$/i, '')
        setBookName(nameWithoutExt)
      }
    }
  }

  const handleSubmit = async (e, confirmOverwrite = false) => {
    e?.preventDefault()
    if (!file || !bookName) return

    setLoading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('bookName', bookName)
    formData.append('uploadType', 'full_book') // זיהוי כספר שלם
    if (confirmOverwrite) {
      formData.append('confirmOverwrite', 'true')
    }

    try {
      // שימוש ב-API החדש של ה-Rewrite
      const res = await fetch('/api/upload-book', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()

      // אם נדרש אישור
      if (data.requiresConfirmation) {
        setLoading(false)
        const confirmed = await showConfirm(
          'קובץ קיים',
          data.message
        )
        
        if (confirmed) {
          await handleSubmit(null, true)
        }
        return
      }

      if (data.success) {
        showAlert('הצלחה', 'הספר הועלה בהצלחה!')
        setFile(null)
        setBookName('')
        // איפוס ה-input כדי לאפשר העלאה נוספת
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בהעלאה')
      }
    } catch (err) {
      showAlert('שגיאה', 'שגיאת תקשורת')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-2 font-frank">
              העלאת ספר חדש
            </h1>
            <p className="text-on-surface/70">
              תרום לקהילה על ידי העלאת טקסטים של ספרי קודש (כל פורמטי טקסט ווורד)
            </p>
          </div>

          <div className="glass p-8 rounded-2xl">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold mb-2">שם הספר</label>
                <input
                  type="text"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: מסילת ישרים"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">קובץ טקסט או וורד</label>
                <div className="border-2 border-dashed border-surface-variant rounded-lg p-8 text-center hover:bg-surface/50 transition-colors cursor-pointer relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.doc,.docx,.rtf,.odt,text/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required
                  />
                  {file ? (
                    <div className="text-primary font-bold flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined">description</span>
                      {file.name}
                    </div>
                  ) : (
                    <div className="text-on-surface/60">
                      <span className="material-symbols-outlined text-4xl mb-2">upload_file</span>
                      <p>גרור קובץ לכאן או לחץ לבחירה</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !file}
                className="w-full py-3 bg-primary text-on-primary rounded-lg font-bold hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <span className="material-symbols-outlined animate-spin">progress_activity</span>}
                {loading ? 'מעלה...' : 'העלה ספר'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}