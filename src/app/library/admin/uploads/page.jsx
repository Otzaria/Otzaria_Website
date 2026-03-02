'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDialog } from '@/components/DialogContext'
import StatusConfigModal from '@/components/StatusConfigModal'
import StatusBadge from '@/components/StatusBadge'
import StatusEditor from '@/components/StatusEditor'
import UploadNotificationSettings from '@/components/UploadNotificationSettings'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminUploadsPage() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedBooks, setExpandedBooks] = useState({}) // מעקב אחרי ספרים מורחבים
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTypes, setFilterTypes] = useState([]) // מערך של סוגים שנבחרו
  const [filterStatuses, setFilterStatuses] = useState([]) // מערך של סטטוסים שנבחרו
  const [showFilterMenu, setShowFilterMenu] = useState(false) // הצגת תפריט סינון
  const [bookStatuses, setBookStatuses] = useState({}) // הגדרות סטטוסים
  const [editingStatus, setEditingStatus] = useState(null) // שם הספר שעורכים את הסטטוס שלו
  const [showStatusConfig, setShowStatusConfig] = useState(false) // הצגת חלון הגדרות סטטוסים
  const [showNotificationSettings, setShowNotificationSettings] = useState(false) // הצגת חלון הגדרות התראות
  const router = useRouter()
  const { showConfirm, showAlert } = useDialog()

  const loadUploads = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/uploads/list')
      const data = await response.json()
      if (data.success) {
        setUploads(data.uploads)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadBookStatuses = async () => {
    try {
      const response = await fetch('/api/admin/book-statuses')
      const data = await response.json()
      if (data.success) {
        setBookStatuses(data.statuses)
      }
    } catch (error) {
      console.error('Error loading book statuses:', error)
    }
  }

  useEffect(() => {
    loadUploads()
    loadBookStatuses()
  }, [])
  
  // סגירת תפריט סינון בלחיצה מחוץ לתפריט
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterMenu && !event.target.closest('.filter-menu-container')) {
        setShowFilterMenu(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterMenu])

  // חישוב ספירות מאופטם עם useMemo
  const { fullBookCount, singlePageCount } = useMemo(() => {
    return uploads.reduce((counts, upload) => {
      const type = upload.uploadType || 'single_page'
      if (type === 'full_book') {
        counts.fullBookCount++
      } else {
        counts.singlePageCount++
      }
      return counts
    }, { fullBookCount: 0, singlePageCount: 0 })
  }, [uploads])

  // פונקציה לחילוץ שם הספר הבסיסי (ללא מספר עמוד)
  const extractBaseBookName = (bookName) => {
    if (!bookName) return ''
    // Regex to remove various page number formats from the end of the string
    const pagePattern = /(?:\s*עמוד\s*\d+\s*|\s*_page_\d+\s*|\s*page\s*\d+\s*|\s*-\s*עמוד\s*\d+\s*|\s*-\s*page\s*\d+\s*)$/i
    return bookName.replace(pagePattern, '').trim()
  }

  // קיבוץ העלאות לפי ספרים עם סינון חיפוש, סוג וסטטוס
  const groupedByBook = useMemo(() => {
    const groups = {}
    
    // סינון העלאות לפי חיפוש, סוג וסטטוס
    const filteredUploads = uploads.filter(upload => {
      // סינון לפי סוג - אם יש סוגים שנבחרו, בדוק אם העלאה זו בתוכם
      if (filterTypes.length > 0) {
        const uploadType = upload.uploadType || 'single_page'
        if (!filterTypes.includes(uploadType)) return false
      }
      
      // סינון לפי סטטוס - אם יש סטטוסים שנבחרו, בדוק אם העלאה זו בתוכם
      if (filterStatuses.length > 0) {
        const bookStatus = upload.bookStatus || 'not_checked'
        if (!filterStatuses.includes(bookStatus)) return false
      }
      
      // סינון לפי חיפוש
      if (!searchTerm) return true
      
      const bookName = upload.bookName || ''
      const uploaderName = upload.uploadedBy || ''
      
      // נרמול הטקסט - החלפת רווחים במקפים ולהיפך
      const normalizedSearch = searchTerm.toLowerCase()
      const normalizedBookName = bookName.toLowerCase()
      const normalizedUploader = uploaderName.toLowerCase()
      
      // חיפוש רגיל
      if (normalizedBookName.includes(normalizedSearch) || normalizedUploader.includes(normalizedSearch)) {
        return true
      }
      
      // חיפוש עם החלפת רווחים למקפים
      const searchWithDash = normalizedSearch.replace(/\s+/g, '-')
      const searchWithSpace = normalizedSearch.replace(/-/g, ' ')
      
      return normalizedBookName.includes(searchWithDash) || 
             normalizedBookName.includes(searchWithSpace) ||
             normalizedUploader.includes(searchWithDash) ||
             normalizedUploader.includes(searchWithSpace)
    })
    
    filteredUploads.forEach(upload => {
      const baseBookName = extractBaseBookName(upload.bookName)
      if (!groups[baseBookName]) {
        groups[baseBookName] = []
      }
      groups[baseBookName].push(upload)
    })
    
    // מיון הקבוצות לפי תאריך העלאה אחרון
    return Object.entries(groups)
      .map(([bookName, uploads]) => ({
        bookName,
        uploads: uploads.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)),
        latestUpload: uploads.reduce((latest, current) => 
          new Date(current.uploadedAt) > new Date(latest.uploadedAt) ? current : latest
        )
      }))
      .sort((a, b) => new Date(b.latestUpload.uploadedAt) - new Date(a.latestUpload.uploadedAt))
  }, [uploads, searchTerm, filterTypes, filterStatuses])

  // פונקציית עזר גנרית לעדכון מסננים
  const createFilterChangeHandler = (setter) => (value, isChecked) => {
    setter(prev => {
      const newSet = new Set(prev)
      if (isChecked) {
        newSet.add(value)
      } else {
        newSet.delete(value)
      }
      return Array.from(newSet)
    })
  }

  const handleTypeChange = createFilterChangeHandler(setFilterTypes)
  const handleStatusChange = createFilterChangeHandler(setFilterStatuses)

  const toggleBookExpansion = (bookName) => {
    setExpandedBooks(prev => ({
      ...prev,
      [bookName]: !prev[bookName]
    }))
  }

  // רשימת העלאות ממתינות מאופטמת
  const pendingUploads = useMemo(() => 
    uploads.filter(u => u.status === 'pending'), 
    [uploads]
  )
  
  const pendingCount = pendingUploads.length

  const handleMoveToTrash = async (uploadId, uploadName) => {
    showConfirm(
      'העברה לאשפה',
      `האם להעביר את ההעלאה לאשפה?\n\n"${uploadName}"\n\nניתן יהיה לשחזר או למחוק לצמיתות מדף האשפה`,
      async () => {
        try {
          const res = await fetch('/api/admin/uploads/move-to-trash', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId })
          })
          
          if (res.ok) {
            // עדכון אופטימי - הסרה מהרשימה
            setUploads(prev => prev.filter(u => u.id !== uploadId))
            showAlert('הצלחה', 'ההעלאה הועברה לאשפה')
          } else {
            const data = await res.json()
            console.error('API error:', data)
            showAlert('שגיאה', data.error || 'שגיאה בהעברה לאשפה')
          }
        } catch (e) {
          console.error('Exception:', e)
          showAlert('שגיאה', 'שגיאה בהעברה לאשפה')
        }
      },
      'העבר לאשפה',
      'ביטול'
    )
  }

  // --- התיקון כאן: שימוש ב-ID להורדה ---
  const handleDownload = (uploadId, originalName) => {
      const link = document.createElement('a')
      // השרת מצפה ל-ID, לא לשם הקובץ
      link.href = `/api/download/${uploadId}` 
      link.download = originalName || 'download.txt'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
  }

  const handleDownloadAllPending = async () => {
    const pending = pendingUploads
    if (pending.length === 0) {
      showAlert('אין קבצים', 'אין קבצים להורדה')
      return
    }

    showConfirm(
      'הורדת קבצים',
      `להוריד ${pending.length} קבצים כקובץ מאוחד?`,
      async () => {
        try {
          const uploadIds = pending.map(u => u.id)
          const response = await fetch('/api/download/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadIds })
          })
          
          if (!response.ok) {
            throw new Error('שגיאה בהורדת הקבצים')
          }
          
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `combined_uploads_${new Date().toISOString().split('T')[0]}.txt`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          
          showAlert('הצלחה', 'הקובץ המאוחד הורד בהצלחה')
        } catch (error) {
          console.error('Error downloading files:', error)
          showAlert('שגיאה', 'אירעה שגיאה בהורדת הקבצים')
        }
      }
    )
  }

  const handleUpdateBookStatus = async (bookName, newStatus) => {
    try {
      // מציאת כל ההעלאות של הספר
      const bookUploads = uploads.filter(u => extractBaseBookName(u.bookName) === bookName)
      const uploadIds = bookUploads.map(u => u.id)
      
      const response = await fetch('/api/admin/uploads/batch-update-book-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadIds, bookStatus: newStatus })
      })
      
      if (response.ok) {
        setUploads(prev => prev.map(u => 
          uploadIds.includes(u.id) ? { ...u, bookStatus: newStatus } : u
        ))
        setEditingStatus(null)
        showAlert('הצלחה', 'הסטטוס עודכן בהצלחה')
      } else {
        showAlert('שגיאה', 'שגיאה בעדכון הסטטוס')
      }
    } catch (error) {
      console.error('Error updating book status:', error)
      showAlert('שגיאה', 'שגיאה בעדכון הסטטוס')
    }
  }

  const handleBatchUpdateStatus = async (uploadIds, newStatus) => {
    try {
      const response = await fetch('/api/admin/uploads/batch-update-book-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadIds, bookStatus: newStatus })
      })
      
      if (response.ok) {
        setUploads(prev => prev.map(u => 
          uploadIds.includes(u.id) ? { ...u, bookStatus: newStatus } : u
        ))
        showAlert('הצלחה', `הסטטוס עודכן בהצלחה`)
      } else {
        showAlert('שגיאה', 'שגיאה בעדכון הסטטוסים')
      }
    } catch (error) {
      console.error('Error batch updating book status:', error)
      showAlert('שגיאה', 'שגיאה בעדכון הסטטוסים')
    }
  }

  const handleSaveStatusConfig = async (newStatuses) => {
    try {
      const response = await fetch('/api/admin/book-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statuses: newStatuses })
      })
      
      if (response.ok) {
        const data = await response.json()
        // יצירת אובייקט חדש כדי לוודא שReact מזהה את השינוי
        setBookStatuses({ ...data.statuses })
        setShowStatusConfig(false)
        showAlert('הצלחה', 'הגדרות הסטטוסים נשמרו בהצלחה')
      } else {
        showAlert('שגיאה', 'שגיאה בשמירת ההגדרות')
      }
    } catch (error) {
      console.error('Error saving status config:', error)
      showAlert('שגיאה', 'שגיאה בשמירת ההגדרות')
    }
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2 whitespace-nowrap">
              <span className="material-symbols-outlined text-primary">upload_file</span>
              העלאות משתמשים
          </h2>
          
          {/* שדה חיפוש */}
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              search
            </span>
            <input 
              type="text"
              placeholder="חיפוש..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg py-2 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">notifications</span>
            התראות
          </button>
          
          <button
            onClick={() => setShowStatusConfig(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">settings</span>
            הגדרות סטטוסים
          </button>
          
          <Link 
            href="/library/admin/trash"
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            אשפה
          </Link>
          
          {pendingCount > 0 && (
            <button 
              onClick={handleDownloadAllPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              הורד הכל ({pendingCount})
            </button>
          )}
        </div>
      </div>
      
      {/* לחצן סינון */}
      <div className="relative mb-6 filter-menu-container">
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">filter_list</span>
          סינון
          {(filterTypes.length > 0 || filterStatuses.length > 0) && (
            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
          )}
          <span className="material-symbols-outlined text-sm">
            {showFilterMenu ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        
        {/* תפריט סינון */}
        {showFilterMenu && (
          <div className="absolute top-full mt-2 right-0 bg-white border border-gray-200 rounded-lg shadow-xl z-10 p-4 min-w-[400px]">
            <div className="grid grid-cols-2 gap-6">
              {/* עמודה ראשונה - סוג */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b">סוג</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filterTypes.includes('dicta')}
                      onChange={(e) => handleTypeChange('dicta', e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">דיקטה</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filterTypes.includes('full_book')}
                      onChange={(e) => handleTypeChange('full_book', e.target.checked)}
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">ספרים שהועלו</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filterTypes.includes('single_page')}
                      onChange={(e) => handleTypeChange('single_page', e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-700">עמודים שנערכו</span>
                  </label>
                </div>
              </div>
              
              {/* עמודה שניה - סטטוס */}
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-3 pb-2 border-b">סטטוס</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {Object.entries(bookStatuses).map(([key, config]) => (
                    <label 
                      key={key}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={filterStatuses.includes(key)}
                        onChange={(e) => handleStatusChange(key, e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: config.color }}
                      ></span>
                      <span className="text-sm text-gray-700">{config.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            
            {/* כפתור איפוס */}
            {(filterTypes.length > 0 || filterStatuses.length > 0) && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => {
                    setFilterTypes([])
                    setFilterStatuses([])
                  }}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  איפוס סינון
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {loading ? (
          <LoadingSpinner message="טוען העלאות..." />
      ) : uploads.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="material-symbols-outlined text-6xl mb-2">folder_off</span>
            <p>אין העלאות במערכת</p>
          </div>
      ) : (
          <div className="space-y-4">
              {groupedByBook.map(({ bookName, uploads: bookUploads }) => {
                  const isExpanded = expandedBooks[bookName]
                  const hasMultipleUploads = bookUploads.length > 1
                  const firstUpload = bookUploads[0]
                  
                  return (
                      <div key={bookName} className="glass p-5 rounded-xl border border-blue-200 hover:border-blue-300 transition-all">
                          {/* כותרת הספר */}
                          <div 
                              className={`flex items-start gap-4 ${hasMultipleUploads ? 'cursor-pointer' : ''}`}
                              onClick={() => hasMultipleUploads && toggleBookExpansion(bookName)}
                          >
                              <div className="p-3 rounded-lg bg-blue-100 text-blue-700">
                                  <span className="material-symbols-outlined text-3xl">
                                      {hasMultipleUploads ? 'folder' : 'description'}
                                  </span>
                              </div>
                              
                              <div className="flex-1">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                              {bookName || 'ללא שם'}
                                              {hasMultipleUploads && (
                                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full border border-blue-200 font-bold">
                                                      {bookUploads.length} העלאות
                                                  </span>
                                              )}
                                              {firstUpload.uploadType === 'full_book' && (
                                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full border border-green-200 font-bold">
                                                      ספר שלם
                                                  </span>
                                              )}
                                              {firstUpload.uploadType === 'dicta' && (
                                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full border border-purple-200 font-bold">
                                                      דיקטה
                                                  </span>
                                              )}
                                          </h3>
                                          
                                          {/* סטטוס הספר */}
                                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                              {editingStatus === bookName ? (
                                                  <StatusEditor
                                                      currentStatus={firstUpload.bookStatus || 'not_checked'}
                                                      statuses={bookStatuses}
                                                      onSave={(newStatus) => handleUpdateBookStatus(bookName, newStatus)}
                                                      onCancel={() => setEditingStatus(null)}
                                                  />
                                              ) : (
                                                  <StatusBadge
                                                      status={firstUpload.bookStatus || 'not_checked'}
                                                      statuses={bookStatuses}
                                                      onEdit={() => setEditingStatus(bookName)}
                                                      editable={true}
                                                  />
                                              )}
                                          </div>
                                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                              <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">person</span>
                                                {firstUpload.uploadedBy || 'אורח'}
                                              </span>
                                              <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">calendar_today</span>
                                                {new Date(firstUpload.uploadedAt).toLocaleDateString('he-IL')}
                                              </span>
                                              {!hasMultipleUploads && (
                                                  <span className="flex items-center gap-1" title={firstUpload.originalFileName}>
                                                    <span className="material-symbols-outlined text-sm">attachment</span>
                                                    <span className="truncate max-w-[150px]">{firstUpload.originalFileName}</span>
                                                  </span>
                                              )}
                                          </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                          {hasMultipleUploads && (
                                              <span className="material-symbols-outlined text-gray-400">
                                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* כפתורי פעולה */}
                                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                                      {/* כפתור ערוך - מוצג רק אם כבר נוצר עותק עריכה */}
                                      {firstUpload.editCopy && (
                                          <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/library/dicta-books/edit/${firstUpload.editCopy}`);
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 text-green-600 hover:bg-green-50 rounded-lg text-sm transition-colors"
                                          >
                                              <span className="material-symbols-outlined text-lg">edit</span>
                                              ערוך עותק
                                          </button>
                                      )}
                                      
                                      {/* כפתור צור עותק עריכה - מוצג רק אם עדיין לא נוצר עותק */}
                                      {!firstUpload.editCopy && (
                                          <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                showConfirm(
                                                    'יצירת עותק עריכה',
                                                    `האם ליצור עותק עריכה של "${bookName}"?\n\nשים לב: העותק לא יתעדכן אוטומטית אם יתווספו העלאות נוספות לספר זה. העותק יישמר במערכת ויהיה ניתן לעריכה כמו ספרי דיקטה.`,
                                                    async () => {
                                                        try {
                                                            setLoading(true);
                                                            const uploadIds = bookUploads.map(u => u.id);
                                                            const response = await fetch('/api/admin/uploads/create-edit-copy', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ uploadIds, bookName })
                                                            });
                                                            
                                                            const data = await response.json();
                                                            
                                                            if (data.success) {
                                                                // עדכון מקומי של ה-state
                                                                setUploads(prev => prev.map(u => 
                                                                    uploadIds.includes(u.id) 
                                                                        ? { ...u, editCopy: data.editCopyId, editCopyCreatedAt: new Date().toISOString() } 
                                                                        : u
                                                                ));
                                                                showAlert('הצלחה', 'עותק העריכה נוצר בהצלחה');
                                                            } else {
                                                                showAlert('שגיאה', data.error || 'שגיאה ביצירת עותק העריכה');
                                                            }
                                                        } catch (error) {
                                                            console.error('Error creating edit copy:', error);
                                                            showAlert('שגיאה', 'שגיאה ביצירת עותק העריכה');
                                                        } finally {
                                                            setLoading(false);
                                                        }
                                                    },
                                                    'צור עותק',
                                                    'ביטול'
                                                );
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 text-purple-600 hover:bg-purple-50 rounded-lg text-sm transition-colors"
                                          >
                                              <span className="material-symbols-outlined text-lg">content_copy</span>
                                              צור עותק עריכה
                                          </button>
                                      )}
                                      
                                      {hasMultipleUploads && (
                                          <>
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    showConfirm(
                                                        'הורדת קבצי ספר',
                                                        `האם להוריד את כל ${bookUploads.length} ההעלאות של "${bookName}" כקובץ מאוחד?`,
                                                        async () => {
                                                            try {
                                                                const uploadIds = bookUploads.map(u => u.id);
                                                                const response = await fetch('/api/download/batch', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ uploadIds })
                                                                });
                                                                
                                                                if (!response.ok) {
                                                                    throw new Error('שגיאה בהורדת הקבצים');
                                                                }
                                                                
                                                                const blob = await response.blob();
                                                                const url = URL.createObjectURL(blob);
                                                                const a = document.createElement('a');
                                                                a.href = url;
                                                                a.download = `${bookName}_uploads.txt`;
                                                                document.body.appendChild(a);
                                                                a.click();
                                                                document.body.removeChild(a);
                                                                URL.revokeObjectURL(url);
                                                                showAlert('הצלחה', 'הקובץ המאוחד הורד בהצלחה');
                                                            } catch (error) {
                                                                console.error('Error downloading files:', error);
                                                                showAlert('שגיאה', 'אירעה שגיאה בהורדת הקבצים');
                                                            }
                                                        }
                                                    );
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">download</span>
                                                  הורד הכל ({bookUploads.length})
                                              </button>
                                              
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    showConfirm(
                                                        'העברה לאשפה',
                                                        `האם להעביר את כל ${bookUploads.length} ההעלאות של "${bookName}" לאשפה?`,
                                                        async () => {
                                                            try {
                                                                const uploadIds = bookUploads.map(u => u.id)
                                                                const res = await fetch('/api/admin/uploads/batch-move-to-trash', {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ uploadIds })
                                                                })
                                                                
                                                                if (res.ok) {
                                                                    setUploads(prev => prev.filter(u => !bookUploads.find(bu => bu.id === u.id)))
                                                                    showAlert('הצלחה', `${bookUploads.length} העלאות הועברו לאשפה`)
                                                                } else {
                                                                    showAlert('שגיאה', 'שגיאה בהעברה לאשפה')
                                                                }
                                                            } catch (e) {
                                                                console.error('Error moving to trash:', e)
                                                                showAlert('שגיאה', 'שגיאה בהעברה לאשפה')
                                                            }
                                                        },
                                                        'העבר הכל לאשפה',
                                                        'ביטול'
                                                    )
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete</span>
                                                  העבר הכל לאשפה
                                              </button>
                                          </>
                                      )}
                                      
                                      {!hasMultipleUploads && (
                                          <>
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDownload(firstUpload.id, firstUpload.originalFileName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">download</span>
                                                  הורד קובץ
                                              </button>
                                              
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleMoveToTrash(firstUpload.id, firstUpload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete</span>
                                                  העבר לאשפה
                                              </button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>
                          
                          {/* רשימת העלאות מורחבת */}
                          {hasMultipleUploads && isExpanded && (
                              <div className="mt-4 mr-16 space-y-3 border-r-2 border-blue-300 pr-4">
                                  {bookUploads.map(upload => (
                                      <div key={upload.id} className="bg-white/50 p-4 rounded-lg border border-gray-200">
                                          <div className="flex justify-between items-start mb-2">
                                              <div className="flex-1">
                                                  <h4 className="font-semibold text-gray-800">
                                                      {upload.bookName}
                                                  </h4>
                                                  
                                                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                                      <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">person</span>
                                                        {upload.uploadedBy || 'אורח'}
                                                      </span>
                                                      <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">calendar_today</span>
                                                        {new Date(upload.uploadedAt).toLocaleDateString('he-IL')}
                                                      </span>
                                                      <span className="flex items-center gap-1" title={upload.originalFileName}>
                                                        <span className="material-symbols-outlined text-xs">attachment</span>
                                                        <span className="truncate max-w-[150px]">{upload.originalFileName}</span>
                                                      </span>
                                                  </div>
                                              </div>
                                          </div>
                                          
                                          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-gray-100">
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDownload(upload.id, upload.originalFileName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-sm">download</span>
                                                  הורד
                                              </button>
                                              
                                              <div className="w-px h-5 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleMoveToTrash(upload.id, upload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-lg text-xs transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-sm">delete</span>
                                                  העבר לאשפה
                                              </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  )
              })}
          </div>
      )}
      
      {/* חלון הגדרות סטטוסים */}
      {showStatusConfig && (
        <StatusConfigModal
          statuses={bookStatuses}
          uploads={uploads}
          onSave={handleSaveStatusConfig}
          onClose={() => setShowStatusConfig(false)}
        />
      )}
      
      {/* חלון הגדרות התראות */}
      {showNotificationSettings && (
        <UploadNotificationSettings
          onClose={() => setShowNotificationSettings(false)}
        />
      )}

    </div>
  )
}
