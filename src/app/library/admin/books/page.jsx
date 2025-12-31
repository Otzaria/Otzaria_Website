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

  const loadBooks = async () => {
    try {
      setLoading(true)
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
    if (!confirm('האם אתה בטוח שברצונך למחוק את הספר? פעולה זו אינה הפיכה!')) return

    try {
      const response = await fetch('/api/admin/books/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookPath }) // שים לב: ה-API צריך לקבל bookId או Path
      })
      const result = await response.json()
      if (result.success) {
        alert('הספר נמחק בהצלחה!')
        loadBooks()
      } else {
        alert(result.error || 'שגיאה במחיקה')
      }
    } catch (e) {
      alert('שגיאה במחיקת הספר')
    }
  }

  if (loading) return <div className="text-center p-10">טוען ספרים...</div>

  return (
    <div className="glass-strong p-6 rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-on-surface">ניהול ספרים</h2>
        <button
          onClick={() => setShowAddBook(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors"
        >
          <span className="material-symbols-outlined">add</span>
          <span>הוסף ספר</span>
        </button>
      </div>

      {books.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-on-surface/60">אין ספרים במערכת</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map(book => (
            <div key={book.id || book.path} className="glass p-4 rounded-lg">
              <div className="flex items-start gap-3">
                {book.thumbnail && (
                  <Image
                    src={book.thumbnail}
                    alt={book.name}
                    width={60}
                    height={80}
                    className="rounded object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-on-surface mb-1 truncate" title={book.name}>{book.name}</h3>
                  <p className="text-sm text-on-surface/60 mb-2">
                    {book.completedPages || 0} / {book.totalPages || 0} עמודים
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href={`/library/book/${book.path}`}
                      className="text-sm text-primary hover:text-accent"
                    >
                      צפה
                    </Link>
                    <button
                      onClick={() => setEditingBookInfo(book)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      הוסף מידע
                    </button>
                    <button
                      onClick={() => handleDeleteBook(book.path)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddBookDialog
        isOpen={showAddBook}
        onClose={() => setShowAddBook(false)}
        onBookAdded={loadBooks}
      />

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