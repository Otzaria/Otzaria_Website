'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import AddBookDialog from '@/components/AddBookDialog'
import EditBookInfoDialog from '@/components/EditBookInfoDialog'

export default function AdminBooksPage() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddBook, setShowAddBook] = useState(false)
  const [editingBookInfo, setEditingBookInfo] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const loadBooks = async () => {
    try {
      setLoading(true)
      // שימוש ב-API החדש שקורא ממונגו
      const response = await fetch('/api/library/list')
      const data = await response.json()
      if (data.success) {
        setBooks(data.books)
      }
    } catch (error) {
      console.error('Error loading books:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBooks()
  }, [])

  const handleDeleteBook = async (bookPath) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הספר? כל העמודים והמידע יימחקו לצמיתות!')) return

    try {
      const response = await fetch('/api/admin/books/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookPath })
      })
      const result = await response.json()
      if (result.success) {
        setBooks(prev => prev.filter(b => b.path !== bookPath))
        alert('הספר נמחק בהצלחה!')
      } else {
        alert(result.error || 'שגיאה במחיקה')
      }
    } catch (e) {
      alert('שגיאה במחיקת הספר')
    }
  }

  const filteredBooks = books.filter(book => 
    book.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return (
    <div className="flex justify-center items-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
    </div>
  )

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2 whitespace-nowrap">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                ניהול ספרים
            </h2>
            <div className="relative w-full md:w-64">
                <input 
                    type="text"
                    placeholder="חיפוש ספר..."
                    className="w-full border rounded-lg pr-8 pl-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <span className="material-symbols-outlined absolute right-2 top-2 text-gray-400 text-lg">search</span>
            </div>
        </div>
        
        <button
          onClick={() => setShowAddBook(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-accent transition-all shadow-md w-full md:w-auto justify-center"
        >
          <span className="material-symbols-outlined">add_circle</span>
          <span className="font-bold">הוסף ספר חדש</span>
        </button>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <span className="material-symbols-outlined text-6xl mb-2">library_books</span>
          <p>אין ספרים במערכת עדיין</p>
        </div>
      ) : filteredBooks.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
             <p>לא נמצאו ספרים התואמים לחיפוש</p>
          </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredBooks.map(book => {
              const progress = book.totalPages > 0 ? Math.round((book.completedPages / book.totalPages) * 100) : 0;
              return (
                <div key={book.id || book.path} className="group glass p-0 rounded-xl border border-white/50 hover:border-primary/50 transition-all hover:shadow-lg overflow-hidden flex flex-col">
                  {/* Header/Image Area */}
                  <div className="bg-gradient-to-b from-primary/5 to-transparent p-4 flex items-start justify-between">
                    <div className="flex gap-3">
                        {book.thumbnail ? (
                        <Image
                            src={book.thumbnail}
                            alt={book.name}
                            width={50}
                            height={70}
                            className="rounded shadow-sm object-cover"
                        />
                        ) : (
                            <div className="w-[50px] h-[70px] bg-gray-200 rounded flex items-center justify-center text-gray-400">
                                <span className="material-symbols-outlined text-2xl">book</span>
                            </div>
                        )}
                        <div>
                            <h3 className="font-bold text-on-surface line-clamp-1 text-lg" title={book.name}>{book.name}</h3>
                            <span className="text-xs text-gray-500 bg-white/50 px-2 py-0.5 rounded-full border border-gray-100">
                                {book.category || 'כללי'}
                            </span>
                        </div>
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="p-4 pt-2 flex-1">
                      <div className="mt-2 mb-4">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>התקדמות</span>
                            <span className="font-bold">{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                                className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-center mt-1 text-gray-500">
                            {book.completedPages || 0} מתוך {book.totalPages || 0} עמודים הושלמו
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-auto">
                        <Link
                          href={`/library/book/${encodeURIComponent(book.path)}`}
                          className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          צפה
                        </Link>
                        <button
                          onClick={() => setEditingBookInfo(book)}
                          className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">edit_note</span>
                          פרטים
                        </button>
                      </div>
                      <button
                          onClick={() => handleDeleteBook(book.path)}
                          className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors opacity-60 hover:opacity-100"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          מחק ספר
                        </button>
                  </div>
                </div>
              )
          })}
        </div>
      )}

      {/* דיאלוג הוספת ספר */}
      <AddBookDialog
        isOpen={showAddBook}
        onClose={() => setShowAddBook(false)}
        onBookAdded={loadBooks}
      />

      {/* דיאלוג עריכת פרטי ספר */}
      {editingBookInfo && (
        <EditBookInfoDialog
          book={editingBookInfo}
          onClose={() => setEditingBookInfo(null)}
          onSave={loadBooks}
        />
      )}
    </div>
  )
}