'use client'

import { useState, useEffect } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminPagesPage() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', book: '', userId: '' })
  const [bookSearchTerm, setBookSearchTerm] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [showBookMenu, setShowBookMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [editingPage, setEditingPage] = useState(null)
  const [editForm, setEditForm] = useState({})
  
  const [booksList, setBooksList] = useState([])
  const [usersList, setUsersList] = useState([])
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const { showAlert, showConfirm } = useDialog()

  // טעינת כל הספרים והמשתמשים בתחילה
  const loadAllBooksAndUsers = async () => {
    try {
      // טעינת כל העמודים ללא סינון כדי לקבל את כל הספרים
      const res = await fetch('/api/admin/pages/list?limit=10000')
      const data = await res.json()
      
      if (data.success) {
        // יצירת רשימת ספרים ייחודית מכל העמודים
        const books = [...new Set(data.pages.map(p => p.bookName))].sort()
        setBooksList(books)
        
        // יצירת רשימת משתמשים ייחודית מכל העמודים
        const users = data.pages
            .filter(p => p.claimedBy)
            .reduce((acc, p) => {
                if (!acc.some(u => u.id === p.claimedById)) {
                    acc.push({ id: p.claimedById, name: p.claimedBy })
                }
                return acc
            }, [])
        setUsersList(users)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadPages = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.book) params.append('book', filters.book)
      if (filters.userId) params.append('userId', filters.userId)
      
      const res = await fetch(`/api/admin/pages/list?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setPages(data.pages)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAllBooksAndUsers()
    loadPages()
  }, [])

  useEffect(() => {
    loadPages()
  }, [filters])

  // סגירת תפריטים בלחיצה מחוץ
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showBookMenu && !event.target.closest('.book-menu-container')) {
        setShowBookMenu(false)
      }
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showBookMenu, showUserMenu])

  const startEdit = (page) => {
      setEditingPage(`${page.bookName}-${page.number}`)
      setEditForm({ status: page.status })
  }

  const cancelEdit = () => {
      setEditingPage(null)
      setEditForm({})
  }

  const saveEdit = async (bookName, pageNumber) => {
      try {
          const res = await fetch('/api/admin/pages/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  bookName, 
                  pageNumber, 
                  updates: editForm 
              })
          })
          
          if (res.ok) {
              setEditingPage(null)
              loadPages()
          } else {
              showAlert('שגיאה', 'שגיאה בשמירה')
          }
      } catch (e) {
          showAlert('שגיאה', 'תקלה בתקשורת')
      }
  }

  const handleReleasePage = (bookName, pageNumber) => {
      showConfirm(
          'שחרור עמוד',
          'לשחרר את העמוד? המשתמש יאבד את השיוך לעמוד זה.',
          async () => {
              try {
                  await fetch('/api/admin/pages/update', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                          bookName, 
                          pageNumber, 
                          updates: { status: 'available', claimedBy: null, claimedAt: null } 
                      })
                  })
                  loadPages()
              } catch (e) {
                  showAlert('שגיאה', 'אירעה שגיאה בעת שחרור העמוד')
              }
          }
      )
  }

  const handleDownload = (pageId, fileName) => {
      if (!pageId) {
          showAlert('שגיאה', 'שגיאה: מזהה עמוד חסר');
          return;
      }
      const link = document.createElement('a')
      link.href = `/api/admin/pages/download/${pageId}`
      link.download = fileName || 'page.txt'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
  }

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (col) => {
    if (sortConfig.key !== col) return '↕'
    return sortConfig.direction === 'asc' ? '↑' : '↓'
  }

  const sortedPages = [...pages].sort((a, b) => {
    if (!sortConfig.key) return 0
    let aVal = a[sortConfig.key] ?? ''
    let bVal = b[sortConfig.key] ?? ''
    if (sortConfig.key === 'updatedAt') {
      aVal = new Date(aVal).getTime() || 0
      bVal = new Date(bVal).getTime() || 0
    } else if (sortConfig.key === 'number') {
      aVal = Number(aVal) || 0
      bVal = Number(bVal) || 0
    } else {
      aVal = String(aVal).toLowerCase()
      bVal = String(bVal).toLowerCase()
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const handleDownloadAll = () => {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.book) params.append('book', filters.book)
      if (filters.userId) params.append('userId', filters.userId)
      
      const link = document.createElement('a')
      link.href = `/api/admin/pages/download-batch?${params.toString()}`
      link.download = 'all-pages.txt'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">description</span>
          ניהול עמודים
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-surface/50 p-4 rounded-xl border border-surface-variant">
          <div className="flex flex-col">
              <label className="text-sm font-bold text-gray-700 mb-1">סטטוס</label>
              <select 
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none h-[42px]"
                value={filters.status}
                onChange={e => setFilters({...filters, status: e.target.value})}
              >
                  <option value="">הכל</option>
                  <option value="available">זמין</option>
                  <option value="in-progress">בטיפול</option>
                  <option value="completed">הושלם</option>
              </select>
          </div>
          
          {/* תפריט ספר עם חיפוש */}
          <div className="flex flex-col relative book-menu-container">
              <label className="text-sm font-bold text-gray-700 mb-1">ספר</label>
              <button
                onClick={() => setShowBookMenu(!showBookMenu)}
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none h-[42px] text-right flex items-center justify-between"
              >
                <span className="material-symbols-outlined text-sm">expand_more</span>
                <span className="flex-1">{filters.book || 'כל הספרים'}</span>
              </button>
              
              {showBookMenu && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="חיפוש..."
                    value={bookSearchTerm}
                    onChange={e => setBookSearchTerm(e.target.value)}
                    className="p-2 border-b border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                  <div className="overflow-y-auto">
                    <div
                      onClick={() => {
                        setFilters({...filters, book: ''})
                        setShowBookMenu(false)
                        setBookSearchTerm('')
                      }}
                      className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      כל הספרים
                    </div>
                    {booksList
                      .filter(book => book.toLowerCase().includes(bookSearchTerm.toLowerCase()))
                      .map(book => (
                        <div
                          key={book}
                          onClick={() => {
                            setFilters({...filters, book})
                            setShowBookMenu(false)
                            setBookSearchTerm('')
                          }}
                          className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          {book}
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>

          {/* תפריט משתמש עם חיפוש */}
          <div className="flex flex-col relative user-menu-container">
              <label className="text-sm font-bold text-gray-700 mb-1">משתמש</label>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none h-[42px] text-right flex items-center justify-between"
              >
                <span className="material-symbols-outlined text-sm">expand_more</span>
                <span className="flex-1">
                  {filters.userId 
                    ? usersList.find(u => u.id === filters.userId)?.name || 'כל המשתמשים'
                    : 'כל המשתמשים'}
                </span>
              </button>
              
              {showUserMenu && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-hidden flex flex-col">
                  <input
                    type="text"
                    placeholder="חיפוש..."
                    value={userSearchTerm}
                    onChange={e => setUserSearchTerm(e.target.value)}
                    className="p-2 border-b border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                  />
                  <div className="overflow-y-auto">
                    <div
                      onClick={() => {
                        setFilters({...filters, userId: ''})
                        setShowUserMenu(false)
                        setUserSearchTerm('')
                      }}
                      className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      כל המשתמשים
                    </div>
                    {usersList
                      .filter(user => user.name.toLowerCase().includes(userSearchTerm.toLowerCase()))
                      .map(user => (
                        <div
                          key={user.id}
                          onClick={() => {
                            setFilters({...filters, userId: user.id})
                            setShowUserMenu(false)
                            setUserSearchTerm('')
                          }}
                          className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                        >
                          {user.name}
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>
          
          <div className="flex items-end gap-2 w-full">
              <button 
                onClick={() => {
                  setFilters({ status: '', book: '', userId: '' })
                  setBookSearchTerm('')
                  setUserSearchTerm('')
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium px-4 rounded-lg transition-colors flex items-center justify-center gap-2 h-[42px] border border-gray-300"
                title="נקה סינון והצג את כל העמודים"
              >
                  <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                  <span className="hidden xl:inline">נקה סינון</span>
              </button>
              
              <button 
                onClick={handleDownloadAll}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 rounded-lg transition-colors flex items-center justify-center gap-2 h-[42px] shadow-sm"
                title="הורד את כל העמודים המוצגים כעת כקובץ טקסט"
              >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span className="hidden xl:inline">הכל</span>
              </button>
          </div>
      </div>

      {loading ? (
          <LoadingSpinner message="טוען עמודים..." />
      ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full bg-white">
                  <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                          <th onClick={() => handleSort('bookName')} className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">ספר {getSortIcon('bookName')}</th>
                          <th onClick={() => handleSort('number')} className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">עמוד {getSortIcon('number')}</th>
                          <th onClick={() => handleSort('status')} className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">סטטוס {getSortIcon('status')}</th>
                          <th onClick={() => handleSort('claimedBy')} className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">משתמש {getSortIcon('claimedBy')}</th>
                          <th onClick={() => handleSort('updatedAt')} className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">עודכן לאחרונה {getSortIcon('updatedAt')}</th>
                          <th className="text-right p-4 font-bold text-gray-700">פעולות</th>
                      </tr>
                  </thead>
                  <tbody>
                      {sortedPages.map((page, idx) => {
                          const isEditing = editingPage === `${page.bookName}-${page.number}`
                          const pageId = page._id || page.id; 
                          // TIQUN: Prefer pageId over idx for stable rendering
                          const rowKey = pageId || idx;

                          return (
                          <tr key={rowKey} className="border-b hover:bg-gray-50 transition-colors">
                              <td className="p-4 font-medium">{page.bookName}</td>
                              <td className="p-4">{page.number}</td>
                              <td className="p-4">
                                  {isEditing ? (
                                      <select 
                                        className="border rounded px-2 py-1 bg-white"
                                        value={editForm.status}
                                        onChange={e => setEditForm({...editForm, status: e.target.value})}
                                      >
                                          <option value="available">זמין</option>
                                          <option value="in-progress">בטיפול</option>
                                          <option value="completed">הושלם</option>
                                      </select>
                                  ) : (
                                      <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                                          page.status === 'completed' ? 'bg-green-100 text-green-800' :
                                          page.status === 'in-progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                                      }`}>
                                          <span className="material-symbols-outlined text-xs">
                                            {page.status === 'completed' ? 'check_circle' : page.status === 'in-progress' ? 'edit' : 'lock_open'}
                                          </span>
                                          {page.status === 'completed' ? 'הושלם' : page.status === 'in-progress' ? 'בטיפול' : 'זמין'}
                                      </span>
                                  )}
                              </td>
                              <td className="p-4 text-sm">{page.claimedBy || '-'}</td>
                              <td className="p-4 text-sm text-gray-500">
                                  {new Date(page.updatedAt || page.createdAt || Date.now()).toLocaleDateString('he-IL')}
                              </td>
                              <td className="p-4 flex gap-2">
                                  {isEditing ? (
                                      <>
                                          <button 
                                            onClick={() => saveEdit(page.bookName, page.number)}
                                            className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg transition-colors"
                                            title="שמור"
                                          >
                                              <span className="material-symbols-outlined">check</span>
                                          </button>
                                          <button 
                                            onClick={cancelEdit}
                                            className="text-gray-500 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
                                            title="ביטול"
                                          >
                                              <span className="material-symbols-outlined">close</span>
                                          </button>
                                      </>
                                  ) : (
                                      <>
                                          <button 
                                            onClick={() => startEdit(page)}
                                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                                            title="ערוך סטטוס"
                                          >
                                              <span className="material-symbols-outlined">edit</span>
                                          </button>
                                          {page.status !== 'available' && (
                                              <button 
                                                onClick={() => handleReleasePage(page.bookName, page.number)}
                                                className="text-orange-600 hover:bg-orange-50 p-1.5 rounded-lg transition-colors"
                                                title="שחרר עמוד"
                                              >
                                                  <span className="material-symbols-outlined">lock_open</span>
                                              </button>
                                          )}
                                      </>
                                  )}

                                  <button 
                                    onClick={() => handleDownload(pageId, `${page.bookName}-${page.number}.txt`)}
                                    className="text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition-colors"
                                    title="הורד טקסט"
                                  >
                                      <span className="material-symbols-outlined">download</span>
                                  </button>
                                  
                              </td>
                          </tr>
                      )})}
                  </tbody>
              </table>
              {pages.length === 0 && (
                  <div className="text-center py-10 text-gray-500">
                      <p>לא נמצאו עמודים התואמים את הסינון</p>
                  </div>
              )}
          </div>
      )}
      
      <div className="mt-4 text-sm text-gray-500 text-left">
          סה"כ רשומות: {pages.length}
      </div>
    </div>
  )
}
