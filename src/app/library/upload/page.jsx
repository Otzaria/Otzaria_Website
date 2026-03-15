// src/app/library/upload/page.jsx
'use client'

import { useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useDialog } from '@/components/DialogContext'

const BOOK_CATEGORIES = [
  'תנ"ך',
  'מדרש',
  'משנה',
  'תלמוד בכלי',
  'תלמוד ירושלמי',
  'תוספתא',
  'הלכה',
  'שו"ת',
  'קבלה',
  'סדר התפילה',
  'מחשבת ישראל',
  'חסידות',
  'ספרי מוסר',
  'מילונים וספרי יעץ',
  'לימוד יומי',
  'ספרות עזר',
  'אחר'
]

const AUTHOR_CATEGORIES = [
  'ראשונים',
  'אחרונים',
  'מחברי זמנינו',
  'לא ידוע'
]

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showConfirm, showAlert } = useDialog()
  
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  // Form fields
  const [formData, setFormData] = useState({
    bookName: '',
    authorName: '',
    bookCategory: '',
    authorCategory: '',
    authorYear: '',
    publicationYear: '',
    copyrightHolder: '',
    sourceUrl: '',
    isOcr: false,
    ocrDescription: ''
  })

  if (status === 'unauthenticated') {
    router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
    return null
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) {
      setFile(selectedFile)
      // מציע שם ספר לפי שם הקובץ
      if (!formData.bookName) {
        const nameWithoutExt = selectedFile.name.replace(/\.(txt|doc|docx|rtf|odt)$/i, '')
        setFormData(prev => ({ ...prev, bookName: nameWithoutExt }))
      }
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const validateForm = () => {
    const required = ['bookName', 'authorName', 'bookCategory', 'authorCategory', 'authorYear', 'copyrightHolder']
    for (const field of required) {
      if (!formData[field]) {
        showAlert('שדה חסר', `יש למלא את: ${field}`)
        return false
      }
    }
    
    if (formData.isOcr && !formData.ocrDescription) {
      showAlert('שדה חסר', 'יש לתאר את שיטת ה-OCR')
      return false
    }
    
    return true
  }

  const handleSubmit = async (e, confirmOverwrite = false) => {
    e?.preventDefault()
    if (!file) {
      showAlert('שגיאה', 'יש לבחור קובץ')
      return
    }

    if (!validateForm()) return

    setLoading(true)

    const uploadFormData = new FormData()
    uploadFormData.append('file', file)
    uploadFormData.append('bookName', formData.bookName)
    uploadFormData.append('authorName', formData.authorName)
    uploadFormData.append('bookCategory', formData.bookCategory)
    uploadFormData.append('authorCategory', formData.authorCategory)
    uploadFormData.append('authorYear', formData.authorYear)
    uploadFormData.append('publicationYear', formData.publicationYear)
    uploadFormData.append('copyrightHolder', formData.copyrightHolder)
    uploadFormData.append('sourceUrl', formData.sourceUrl)
    uploadFormData.append('isOcr', formData.isOcr)
    uploadFormData.append('ocrDescription', formData.ocrDescription)
    uploadFormData.append('uploadType', 'full_book')
    if (confirmOverwrite) {
      uploadFormData.append('confirmOverwrite', 'true')
    }

    try {
      const res = await fetch('/api/upload-book', {
        method: 'POST',
        body: uploadFormData
      })

      const data = await res.json()

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
        setFormData({
          bookName: '',
          authorName: '',
          bookCategory: '',
          authorCategory: '',
          authorYear: '',
          publicationYear: '',
          copyrightHolder: '',
          sourceUrl: '',
          isOcr: false,
          ocrDescription: ''
        })
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
        <div className="max-w-4xl mx-auto">
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
              {/* שם הספר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  שם הספר <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="bookName"
                  value={formData.bookName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: מסילת ישרים"
                  required
                />
              </div>

              {/* שם המחבר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  שם המחבר <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="authorName"
                  value={formData.authorName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: משה חיים לוצאטו"
                  required
                />
              </div>

              {/* קטגוריית הספר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  קטגוריית הספר <span className="text-red-500">*</span>
                </label>
                <select
                  name="bookCategory"
                  value={formData.bookCategory}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  required
                >
                  <option value="">בחר קטגוריה</option>
                  {BOOK_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* קטגוריית המחבר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  קטגוריית המחבר <span className="text-red-500">*</span>
                </label>
                <select
                  name="authorCategory"
                  value={formData.authorCategory}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  required
                >
                  <option value="">בחר קטגוריה</option>
                  {AUTHOR_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* שנת המחבר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  שנת המחבר (לדוגמה: שנה עברית) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="authorYear"
                  value={formData.authorYear}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: תש״ד"
                  required
                />
              </div>

              {/* שנת הדפסה */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  שנת הדפסת הספר (אם הודפס כבר)
                </label>
                <input
                  type="text"
                  name="publicationYear"
                  value={formData.publicationYear}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: תשנ״ה"
                />
              </div>

              {/* בעל הזכויות */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  בעל הזכויות יוצרים <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="copyrightHolder"
                  value={formData.copyrightHolder}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: הוצאת כתר או תחום ציבורי"
                  required
                />
              </div>

              {/* מקור הספר */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  מקור הספר (קישור לPDF ציבורי אם קיים)
                </label>
                <input
                  type="url"
                  name="sourceUrl"
                  value={formData.sourceUrl}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                  placeholder="לדוגמה: https://www.hebrewbooks.org/..."
                />
              </div>

              {/* האם OCR */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  האם הטקסט הוא ע"י OCR? <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isOcr"
                      checked={!formData.isOcr}
                      onChange={() => setFormData(prev => ({ ...prev, isOcr: false, ocrDescription: '' }))}
                      className="w-4 h-4"
                    />
                    <span>לא - טקסט מקורי</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isOcr"
                      checked={formData.isOcr}
                      onChange={() => setFormData(prev => ({ ...prev, isOcr: true }))}
                      className="w-4 h-4"
                    />
                    <span>כן - טקסט מ-OCR</span>
                  </label>
                </div>
              </div>

              {/* תיאור OCR אם נבחר */}
              {formData.isOcr && (
                <div>
                  <label className="block text-sm font-bold mb-2">
                    תאר את שיטת ה-OCR (איזה תוכנה או שיטה?) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="ocrDescription"
                    value={formData.ocrDescription}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-lg border border-surface-variant bg-surface focus:ring-2 focus:ring-primary outline-none"
                    placeholder="לדוגמה: Google Docs OCR, Adobe Acrobat, Tesseract, או תיאור אחר של השיטה"
                    rows="3"
                    required
                  />
                </div>
              )}

              {/* קובץ טקסט או וורד */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  קובץ טקסט או וורד <span className="text-red-500">*</span>
                </label>
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