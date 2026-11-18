'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Header from '@/components/layout/Header'
import { hasPrivateOcrAccess } from '@/lib/roles'
import PrivateBookCard from '@/components/privateBooks/PrivateBookCard'
import PrivateBookUpload from '@/components/privateBooks/PrivateBookUpload'

export default function PersonalLibraryPage() {
  const { data: session, status } = useSession()
  const allowed = hasPrivateOcrAccess(session?.user)
  const [books, setBooks] = useState([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const res = await fetch('/api/user/books', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'טעינת הספרים נכשלה')
    setBooks(data.books)
    setError('')
  }, [])
  useEffect(() => {
    if (allowed) refresh().catch(e => setError(e.message))
  }, [allowed, refresh])
  return <div className="min-h-screen bg-background" dir="rtl">
    <Header />
    <main id="main-content" className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold">הספרים הפרטיים שלי</h1>
      {status === 'loading' ? <p>טוען…</p> : !allowed ? <p>נדרשת הרשאת OCR לספרים פרטיים ממנהל האתר.</p> : <>
        <p>הספרים נשארים פרטיים גם בסיום העיבוד. אפשר להעלות PDF, להפעיל OCR ולהוריד את הטקסט.</p>
        <PrivateBookUpload onSuccess={refresh} />
        {error && <p role="alert">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">{books.map(book => <PrivateBookCard key={book.id} book={book} />)}</div>
      </>}
    </main>
  </div>
}
