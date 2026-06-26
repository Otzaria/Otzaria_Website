'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDialog } from '@/components/providers/DialogContext'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import StatusBadge from '@/components/status/StatusBadge'
import StatusEditor from '@/components/status/StatusEditor'
import UploadNotificationSettings from '@/components/notifications/UploadNotificationSettings'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MetadataDisplay from '@/components/data-display/MetadataDisplay'

export default function AdminUploadsPage() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedBooks, setExpandedBooks] = useState({}) // מעקב אחרי ספרים מורחבים
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTypes, setFilterTypes] = useState([]) // מערך של סוגים שנבחרו
  const [filterStatuses, setFilterStatuses] = useState([]) // מערך של סטטוסים שנבחרו
  const [showFilterMenu, setShowFilterMenu] = useState(false) // הצגת תפריט סינון
  const [filterUsers, setFilterUsers] = useState([]) // סינון לפי משתמשים
  const [showUserDropdown, setShowUserDropdown] = useState(false) // הצגת dropdown משתמשים
  const [userSearch, setUserSearch] = useState('') // חיפוש בתוך dropdown
  const [bookStatuses, setBookStatuses] = useState({}) // הגדרות סטטוסים
  const [editingStatus, setEditingStatus] = useState(null) // שם הספר שעורכים את הסטטוס שלו
  const [showStatusConfig, setShowStatusConfig] = useState(false) // הצגת חלון הגדרות סטטוסים
  const [showNotificationSettings, setShowNotificationSettings] = useState(false) // הצגת חלון הגדרות התראות
  const [showMessageDialog, setShowMessageDialog] = useState(false) // הצגת חלון שליחת הודעה
  const [messageRecipient, setMessageRecipient] = useState(null) // נמען ההודעה
  const [messageSubject, setMessageSubject] = useState('') // נושא ההודעה
  const [messageText, setMessageText] = useState('') // תוכן ההודעה
  const [sendingMessage, setSendingMessage] = useState(false) // מצב שליחת הודעה
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

  // סגירת dropdown משתמשים בלחיצה מחוץ
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserDropdown && !event.target.closest('.user-filter-container')) {
        setShowUserDropdown(false)
        setUserSearch('')
      }

    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserDropdown])

  // רשימת משתמשים ייחודיים מה-uploads
  const uniqueUsers = useMemo(() => {
    const map = new Map()
    uploads.forEach(u => {
      const email = u.uploadedByEmail || ''
      const name = u.uploadedBy || 'אורח'
      const key = email || name
      if (!map.has(key)) map.set(key, { name, email, key })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'))
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

      // סינון לפי משתמשים
      if (filterUsers.length > 0) {
        const key = upload.uploadedByEmail || upload.uploadedBy || 'אורח'
        if (!filterUsers.includes(key)) return false
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
  }, [uploads, searchTerm, filterTypes, filterStatuses, filterUsers])

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

  const _handleBatchUpdateStatus = async (uploadIds, newStatus) => {
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

  const handleSendMessage = (uploaderEmail, uploaderName, bookName) => {
    if (!uploaderEmail) {
      showAlert('שגיאה', 'לא ניתן לשלוח הודעה - העלאה אנונימית')
      return
    }
    setMessageRecipient({ email: uploaderEmail, name: uploaderName })
    setMessageSubject(`בנוגע להעלאת הספר: ${bookName}`)
    setMessageText('')
    setShowMessageDialog(true)
  }

  const handleSendMessageSubmit = async () => {
    if (!messageSubject.trim() || !messageText.trim()) {
      showAlert('שגיאה', 'נא למלא את כל השדות')
      return
    }

    try {
      setSendingMessage(true)
      
      // מציאת המשתמש לפי אימייל
      const usersResponse = await fetch('/api/admin/users')
      const usersData = await usersResponse.json()
      
      if (!usersData.success) {
        showAlert('שגיאה', 'שגיאה בטעינת רשימת המשתמשים')
        return
      }
      
      const user = usersData.users.find(u => u.email === messageRecipient.email)
      if (!user) {
        showAlert('שגיאה', 'לא נמצא משתמש עם כתובת אימייל זו')
        return
      }

      const response = await fetch('/api/messages/send-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: user._id,
          subject: messageSubject,
          message: messageText,
          sendToAll: false
        })
      })

      const result = await response.json()
      if (result.success) {
        showAlert('הצלחה', 'ההודעה נשלחה בהצלחה')
        setShowMessageDialog(false)
        setMessageSubject('')
        setMessageText('')
        setMessageRecipient(null)
      } else {
        showAlert('שגיאה', result.error || 'שגיאה בשליחת הודעה')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showAlert('שגיאה', 'שגיאה בשליחת הודעה')
    } finally {
      setSendingMessage(false)
    }
  }

  return (
    <>
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2 whitespace-nowrap">
              <span className="material-symbols-outlined text-primary">upload_file</span>
              העלאות משתמשים
          </h2>
          
          {/* שדה חיפוש */}
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-neutral-cool-400 text-sm">
              search
            </span>
            <input 
              type="text"
              placeholder="חיפוש..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-neutral-cool-200 rounded-lg py-2 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-cool-400 hover:text-neutral-cool-600"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-info-600 text-white rounded-lg hover:bg-info-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">notifications</span>
            התראות
          </button>
          
          <button
            onClick={() => setShowStatusConfig(true)}
            className="flex items-center gap-2 px-4 py-2 bg-feature-600 text-white rounded-lg hover:bg-feature-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">settings</span>
            הגדרות סטטוסים
          </button>
          
          <Link 
            href="/library/admin/trash"
            className="flex items-center gap-2 px-4 py-2 bg-warning-strong-600 text-white rounded-lg hover:bg-warning-strong-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            אשפה
          </Link>
          
          {pendingCount > 0 && (
            <button 
              onClick={handleDownloadAllPending}
              className="flex items-center gap-2 px-4 py-2 bg-info-600 text-white rounded-lg hover:bg-info-700 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              הורד הכל ({pendingCount})
            </button>
          )}
        </div>
      </div>
      
      {/* כפתורי סינון לפי סוג */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterTypes(filterTypes.includes('dicta') ? filterTypes.filter(t => t !== 'dicta') : [...filterTypes, 'dicta'])}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
            filterTypes.includes('dicta')
              ? 'bg-feature-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">mic</span>
          דיקטה
        </button>
        
        <button
          onClick={() => setFilterTypes(filterTypes.includes('full_book') ? filterTypes.filter(t => t !== 'full_book') : [...filterTypes, 'full_book'])}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
            filterTypes.includes('full_book')
              ? 'bg-success-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">book</span>
          ספרים שהועלו
        </button>
        
        <button
          onClick={() => setFilterTypes(filterTypes.includes('single_page') ? filterTypes.filter(t => t !== 'single_page') : [...filterTypes, 'single_page'])}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
            filterTypes.includes('single_page')
              ? 'bg-warning-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">description</span>
          עמודים שנערכו
        </button>
      </div>
      
      {/* שורת סינון: משתמש + סטטוס */}
      <div className="flex gap-2 mb-6">

      {/* סינון לפי משתמש */}
      <div className="relative user-filter-container">
        <button
          onClick={() => setShowUserDropdown(!showUserDropdown)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
            filterUsers.length > 0
              ? 'bg-info-alt-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">person_search</span>
          {filterUsers.length === 0 && 'סינון לפי משתמש'}
          {filterUsers.length === 1 && (uniqueUsers.find(u => u.key === filterUsers[0])?.name || filterUsers[0])}
          {filterUsers.length > 1 && `${filterUsers.length} משתמשים`}
          {filterUsers.length > 0 && (
            <span
              className="material-symbols-outlined text-sm hover:opacity-70"
              onClick={(e) => { e.stopPropagation(); setFilterUsers([]) }}
            >close</span>
          )}
          {filterUsers.length === 0 && (
            <span className="material-symbols-outlined text-sm">
              {showUserDropdown ? 'expand_less' : 'expand_more'}
            </span>
          )}
        </button>

        {showUserDropdown && (
          <div className="absolute top-full mt-2 right-0 bg-white border border-neutral-200 rounded-lg shadow-xl z-10 p-3 min-w-[230px]">
            <input
              type="text"
              placeholder="חיפוש משתמש..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              autoFocus
              className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {uniqueUsers
                .filter(u => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                .map(u => {
                  const selected = filterUsers.includes(u.key)
                  const emailPrefix = u.email ? u.email.split('@')[0] : ''
                  return (
                    <label
                      key={u.key}
                      className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer ${
                        selected ? 'bg-info-alt-50 text-info-alt-700' : 'hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setFilterUsers(prev =>
                          selected ? prev.filter(k => k !== u.key) : [...prev, u.key]
                        )}
                        className="w-4 h-4 text-info-alt-600 rounded focus:ring-info-alt-500 flex-shrink-0"
                      />
                      <span className="flex-1">{u.name}</span>
                      {emailPrefix && <span className="text-xs text-neutral-400 truncate max-w-[70px]" title={u.email}>{emailPrefix}</span>}
                    </label>
                  )
                })}
              {uniqueUsers.filter(u => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                <p className="text-sm text-neutral-400 text-center py-2">לא נמצאו משתמשים</p>
              )}
            </div>
            {filterUsers.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <button
                  onClick={() => setFilterUsers([])}
                  className="w-full px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                >
                  איפוס בחירה
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* לחצן סינון לסטטוס בלבד */}
      <div className="relative filter-menu-container">
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">filter_list</span>
          סינון לפי סטטוס
          {filterStatuses.length > 0 && (
            <span className="w-2 h-2 bg-info-600 rounded-full"></span>
          )}
          <span className="material-symbols-outlined text-sm">
            {showFilterMenu ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        
        {/* תפריט סינון - רק סטטוס */}
        {showFilterMenu && (
          <div className="absolute top-full mt-2 right-0 bg-white border border-neutral-200 rounded-lg shadow-xl z-10 p-4 min-w-[300px]">
            <h3 className="text-sm font-bold text-neutral-700 mb-3 pb-2 border-b">סטטוס</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {Object.entries(bookStatuses).map(([key, config]) => (
                <label 
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={filterStatuses.includes(key)}
                    onChange={(e) => handleStatusChange(key, e.target.checked)}
                    className="w-4 h-4 text-info-600 rounded focus:ring-info-500"
                  />
                  <span 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: config.color }}
                  ></span>
                  <span className="text-sm text-neutral-700">{config.label}</span>
                </label>
              ))}
            </div>
            
            {/* כפתור איפוס */}
            {filterStatuses.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setFilterStatuses([])}
                  className="w-full px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                >
                  איפוס סינון
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      </div>{/* סוף שורת סינון */}

      {loading ? (
          <LoadingSpinner message="טוען העלאות..." />
      ) : uploads.length === 0 ? (
          <div className="text-center py-16 text-neutral-500">
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
                      <div key={bookName} className="glass p-5 rounded-xl border border-info-200 hover:border-info-300 transition-all">
                          {/* כותרת הספר */}
                          <div 
                              className={`flex items-start gap-4 ${hasMultipleUploads ? 'cursor-pointer' : ''}`}
                              onClick={() => hasMultipleUploads && toggleBookExpansion(bookName)}
                          >
                              <div className="p-3 rounded-lg bg-info-100 text-info-700">
                                  <span className="material-symbols-outlined text-3xl">
                                      {hasMultipleUploads ? 'folder' : 'description'}
                                  </span>
                              </div>
                              
                              <div className="flex-1">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
                                              {bookName || 'ללא שם'}
                                              {hasMultipleUploads && (
                                                  <span className="px-2 py-0.5 bg-info-100 text-info-700 text-xs rounded-full border border-info-200 font-bold">
                                                      {bookUploads.length} העלאות
                                                  </span>
                                              )}
                                              {firstUpload.uploadType === 'full_book' && (
                                                  <span className="px-2 py-0.5 bg-success-100 text-success-700 text-xs rounded-full border border-success-200 font-bold">
                                                      ספר שלם
                                                  </span>
                                              )}
                                              {firstUpload.uploadType === 'dicta' && (
                                                  <span className="px-2 py-0.5 bg-feature-100 text-feature-700 text-xs rounded-full border border-feature-200 font-bold">
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
                                          <div className="flex items-center gap-4 text-sm text-neutral-500 mt-1">
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
                                          
                                          {/* מטא-דטה של הספר */}
                                          <MetadataDisplay upload={firstUpload} />
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                          {hasMultipleUploads && (
                                              <span className="material-symbols-outlined text-neutral-400">
                                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* כפתורי פעולה */}
                                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-neutral-100">
                                      {/* כפתור ערוך - מוצג רק אם כבר נוצר עותק עריכה */}
                                      {firstUpload.editCopy && (
                                          <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/library/dicta-books/edit/${firstUpload.editCopy}`);
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 text-success-600 hover:bg-success-50 rounded-lg text-sm transition-colors"
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
                                            className="flex items-center gap-1 px-3 py-1.5 text-feature-600 hover:bg-feature-50 rounded-lg text-sm transition-colors"
                                          >
                                              <span className="material-symbols-outlined text-lg">content_copy</span>
                                              צור עותק עריכה
                                          </button>
                                      )}
                                      
                                      {hasMultipleUploads && (
                                          <>
                                              <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                                              
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
                                                className="flex items-center gap-1 px-3 py-1.5 text-info-600 hover:bg-info-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">download</span>
                                                  הורד הכל ({bookUploads.length})
                                              </button>
                                              
                                              <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                                              
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
                                                className="flex items-center gap-1 px-3 py-1.5 text-danger-700 hover:bg-danger-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete</span>
                                                  העבר הכל לאשפה
                                              </button>
                                          </>
                                      )}
                                      
                                      {!hasMultipleUploads && (
                                          <>
                                              {/* כפתור שלח הודעה - רק אם יש אימייל */}
                                              {firstUpload.uploadedByEmail && (
                                                <>
                                                  <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleSendMessage(firstUpload.uploadedByEmail, firstUpload.uploadedBy, firstUpload.bookName)
                                                    }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-feature-600 hover:bg-feature-50 rounded-lg text-sm transition-colors"
                                                    title="שלח הודעה למעלה"
                                                  >
                                                      <span className="material-symbols-outlined text-lg">send</span>
                                                      שלח הודעה
                                                  </button>
                                                  
                                                  <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                                                </>
                                              )}
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDownload(firstUpload.id, firstUpload.originalFileName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-info-600 hover:bg-info-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">download</span>
                                                  הורד קובץ
                                              </button>
                                              
                                              <div className="w-px h-6 bg-neutral-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleMoveToTrash(firstUpload.id, firstUpload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-danger-700 hover:bg-danger-50 rounded-lg text-sm transition-colors"
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
                              <div className="mt-4 mr-16 space-y-3 border-r-2 border-info-300 pr-4">
                                  {bookUploads.map(upload => (
                                      <div key={upload.id} className="bg-white/50 p-4 rounded-lg border border-neutral-200">
                                          <div className="flex justify-between items-start mb-2">
                                              <div className="flex-1">
                                                  <h4 className="font-semibold text-neutral-800">
                                                      {upload.bookName}
                                                  </h4>
                                                  
                                                  <div className="flex items-center gap-4 text-xs text-neutral-500 mt-2">
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
                                                  
                                                  {/* מטא-דטה של הספר */}
                                                  <MetadataDisplay upload={upload} textSize="text-xs" />
                                              </div>
                                          </div>
                                          
                                          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-neutral-100">
                                              {/* כפתור שלח הודעה - רק אם יש אימייל */}
                                              {upload.uploadedByEmail && (
                                                <>
                                                  <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleSendMessage(upload.uploadedByEmail, upload.uploadedBy, upload.bookName)
                                                    }}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-feature-600 hover:bg-feature-50 rounded-lg text-xs transition-colors"
                                                    title="שלח הודעה למעלה"
                                                  >
                                                      <span className="material-symbols-outlined text-sm">send</span>
                                                      הודעה
                                                  </button>
                                                  
                                                  <div className="w-px h-5 bg-neutral-300 mx-1"></div>
                                                </>
                                              )}
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDownload(upload.id, upload.originalFileName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-info-600 hover:bg-info-50 rounded-lg text-xs transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-sm">download</span>
                                                  הורד
                                              </button>
                                              
                                              <div className="w-px h-5 bg-neutral-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleMoveToTrash(upload.id, upload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-danger-700 hover:bg-danger-50 rounded-lg text-xs transition-colors"
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

      {/* חלון שליחת הודעה */}
      {showMessageDialog && messageRecipient && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowMessageDialog(false)}
        >
          <div 
            className="flex flex-col bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-neutral-200 flex-shrink-0 bg-white rounded-t-2xl">
              <h3 className="text-2xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-3xl text-primary">send</span>
                שלח הודעה למשתמש
              </h3>
              <p className="text-sm text-neutral-600 mt-2">
                נמען: <span className="font-medium">{messageRecipient.name}</span> ({messageRecipient.email})
              </p>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">נושא</label>
                <input 
                  type="text"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  placeholder="נושא ההודעה..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                  disabled={sendingMessage}
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-on-surface mb-2">תוכן ההודעה</label>
                <textarea 
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="כתוב את ההודעה שלך כאן..."
                  className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm min-h-[150px] resize-none"
                  disabled={sendingMessage}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 border-t border-neutral-200 bg-neutral-50 rounded-b-2xl flex-shrink-0">
              <button 
                onClick={handleSendMessageSubmit}
                disabled={sendingMessage}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-all shadow-md font-bold disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5"
              >
                {sendingMessage ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    <span>שולח...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    <span>שלח הודעה</span>
                  </>
                )}
              </button>
              <button 
                onClick={() => {
                  setShowMessageDialog(false)
                  setMessageSubject('')
                  setMessageText('')
                  setMessageRecipient(null)
                }}
                disabled={sendingMessage}
                className="px-6 py-3 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

