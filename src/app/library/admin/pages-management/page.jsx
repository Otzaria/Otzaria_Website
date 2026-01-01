'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPagesPage() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', book: '', userId: '' })
  const [editingPage, setEditingPage] = useState(null) // ID של העמוד הנערך
  const [editForm, setEditForm] = useState({}) // נתוני העריכה
  
  // נתונים לרשימות בחירה (לקוחים מהדפים שנטענו)
  const [booksList, setBooksList] = useState([])
  const [usersList, setUsersList] = useState([])

  const loadPages = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.book) params.append('book', filters.book)
      if (filters.userId) params.append('userId', filters.userId) // אם ה-API תומך
      
      const res = await fetch(`/api/admin/pages/list?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setPages(data.pages)
        
        // חילוץ רשימות ייחודיות לפילטרים
        const books = [...new Set(data.pages.map(p => p.bookName))].sort()
        setBooksList(books)
        
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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPages()
  }, [filters])

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
              alert('שגיאה בשמירה')
          }
      } catch (e) {
          alert('תקלה בתקשורת')
      }
  }

  const handleReleasePage = async (bookName, pageNumber) => {
      if(!confirm('לשחרר את העמוד? המשתמש יאבד את השיוך לעמוד זה.')) return
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
          alert('שגיאה')
      }
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">description</span>
          ניהול עמודים
      </h2>
      
      {/* פילטרים */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-surface/50 p-4 rounded-xl border border-surface-variant">
          <div className="flex flex-col">
              <label className="text-sm font-bold text-gray-700 mb-1">סטטוס</label>
              <select 
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none"
                value={filters.status}
                onChange={e => setFilters({...filters, status: e.target.value})}
              >
                  <option value="">הכל</option>
                  <option value="available">זמין</option>
                  <option value="in-progress">בטיפול</option>
                  <option value="completed">הושלם</option>
              </select>
          </div>
          
          <div className="flex flex-col">
              <label className="text-sm font-bold text-gray-700 mb-1">ספר</label>
              <select 
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none"
                value={filters.book}
                onChange={e => setFilters({...filters, book: e.target.value})}
              >
                  <option value="">כל הספרים</option>
                  {booksList.map(book => (
                      <option key={book} value={book}>{book}</option>
                  ))}
              </select>
          </div>

           <div className="flex flex-col">
              <label className="text-sm font-bold text-gray-700 mb-1">משתמש</label>
              <select 
                className="border p-2 rounded-lg bg-white focus:ring-2 focus:ring-primary outline-none"
                value={filters.userId}
                onChange={e => setFilters({...filters, userId: e.target.value})}
              >
                  <option value="">כל המשתמשים</option>
                  {usersList.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
              </select>
          </div>
          
          <div className="flex items-end">
              <button 
                onClick={() => setFilters({ status: '', book: '', userId: '' })}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                  <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                  נקה סינון
              </button>
          </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full bg-white">
              <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                      <th className="text-right p-4 font-bold text-gray-700">ספר</th>
                      <th className="text-right p-4 font-bold text-gray-700">עמוד</th>
                      <th className="text-right p-4 font-bold text-gray-700">סטטוס</th>
                      <th className="text-right p-4 font-bold text-gray-700">משתמש</th>
                      <th className="text-right p-4 font-bold text-gray-700">עודכן לאחרונה</th>
                      <th className="text-right p-4 font-bold text-gray-700">פעולות</th>
                  </tr>
              </thead>
              <tbody>
                  {pages.map((page, idx) => {
                      const isEditing = editingPage === `${page.bookName}-${page.number}`
                      return (
                      <tr key={idx} className="border-b hover:bg-gray-50 transition-colors">
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
      
      <div className="mt-4 text-sm text-gray-500 text-left">
          סהכ רשומות: {pages.length}
      </div>
    </div>
  )
}