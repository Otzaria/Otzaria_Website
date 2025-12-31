'use client'

import { useState, useEffect } from 'react'

export default function AdminPagesPage() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', book: '' })
  
  // טעינת עמודים - בגרסה האמיתית נרצה אולי פאגינציה
  const loadPages = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter.status) params.append('status', filter.status)
      if (filter.book) params.append('book', filter.book)
      
      const res = await fetch(`/api/admin/pages/list?${params}`)
      const data = await res.json()
      if (data.success) setPages(data.pages)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPages()
  }, [filter]) // טעינה מחדש כשמשנים פילטר

  const handleReleasePage = async (bookName, pageNumber) => {
      if(!confirm('לשחרר את העמוד?')) return
      try {
          await fetch('/api/admin/pages/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookName, pageNumber, updates: { status: 'available', claimedBy: null } })
          })
          loadPages()
      } catch (e) {
          alert('שגיאה')
      }
  }

  return (
    <div className="glass-strong p-6 rounded-xl">
      <h2 className="text-2xl font-bold mb-6 text-on-surface">ניהול עמודים</h2>
      
      <div className="flex gap-4 mb-6">
          <select 
            className="border p-2 rounded"
            value={filter.status}
            onChange={e => setFilter({...filter, status: e.target.value})}
          >
              <option value="">כל הסטטוסים</option>
              <option value="in-progress">בטיפול</option>
              <option value="completed">הושלם</option>
          </select>
          {/* אפשר להוסיף רשימת ספרים דינמית */}
          <input 
            className="border p-2 rounded"
            placeholder="שם ספר..."
            value={filter.book}
            onChange={e => setFilter({...filter, book: e.target.value})}
            onBlur={loadPages} // חפש כשעוזבים את השדה
          />
      </div>

      <div className="overflow-x-auto">
          <table className="w-full">
              <thead>
                  <tr className="border-b">
                      <th className="text-right p-3">ספר</th>
                      <th className="text-right p-3">מספר עמוד</th>
                      <th className="text-right p-3">סטטוס</th>
                      <th className="text-right p-3">משתמש</th>
                      <th className="text-right p-3">פעולות</th>
                  </tr>
              </thead>
              <tbody>
                  {pages.map((page, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3">{page.bookName}</td>
                          <td className="p-3">{page.number}</td>
                          <td className="p-3">
                              <span className={`px-2 py-1 rounded text-sm ${
                                  page.status === 'completed' ? 'bg-green-100' :
                                  page.status === 'in-progress' ? 'bg-blue-100' : 'bg-gray-100'
                              }`}>
                                  {page.status}
                              </span>
                          </td>
                          <td className="p-3">{page.claimedBy || '-'}</td>
                          <td className="p-3">
                              {page.status !== 'available' && (
                                  <button 
                                    onClick={() => handleReleasePage(page.bookName, page.number)}
                                    className="text-orange-600 hover:bg-orange-50 p-1 rounded"
                                    title="שחרר עמוד"
                                  >
                                      <span className="material-symbols-outlined">lock_open</span>
                                  </button>
                              )}
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
          {pages.length === 0 && <div className="text-center p-4">אין תוצאות</div>}
      </div>
    </div>
  )
}