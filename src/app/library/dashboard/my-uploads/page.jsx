'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

export default function PersonalLibraryPage() {
  const [flatBooks, setFlatBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  const fetchUserBooks = async () => {
    try {
        setLoading(true);
        const res = await fetch('/api/user/books');
        const json = await res.json();
        if (json.success) {
            setFlatBooks(json.books);
        }
    } catch (err) {
        console.error('Error fetching personal books:', err);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserBooks();
  }, [])

  const filteredBooks = useMemo(() => {
    let data = flatBooks;
    if (searchTerm) {
      data = data.filter(book => book.name.toLowerCase().includes(searchTerm.toLowerCase()))
    }
    if (filterStatus !== 'all') {
      data = data.filter(book => {
        if (filterStatus === 'available') return (book.totalPages - book.completedPages) > 0;
        if (filterStatus === 'completed') return book.totalPages > 0 && book.completedPages === book.totalPages;
        return true;
      });
    }
    return data
  }, [flatBooks, searchTerm, filterStatus])

  return (
    <div className="min-h-screen flex flex-col bg-background pb-12">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <h1 className="text-4xl font-bold text-foreground font-frank mb-2">
                    הספרים שלי
                  </h1>
                  <p className="text-on-surface/60 text-lg">
                    אזור אישי - ספרים לעבודה אישית ({flatBooks.length} ספרים)
                  </p>
                  <p className="text-on-surface/60 text-lg">
                    כאן תוכלו להעלות ולנהל ספרים לעבודה אישית שאח"כ יוכנסו לאוצריא
                  </p>
                </div>

                {/* כפתור שפותח את המודל */}
                <button 
                    onClick={() => setIsUploadModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1 active:scale-95"
                >
                    <span className="material-symbols-outlined">upload_file</span>
                    העלאת ספר חדש
                </button>
            </div>
            
            {/* חיפוש וסינון */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-surface-variant flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="חפש בספרים שלך..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500 transition-all"
                    />
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                </div>
                {/* כפתורי סינון */}
                <div className="flex gap-2">
                    {['all', 'available', 'completed'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filterStatus === status 
                                ? 'bg-gray-800 text-white' 
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {status === 'all' ? 'הכל' : status === 'available' ? 'בתהליך' : 'הושלם'}
                        </button>
                    ))}
                </div>
            </div>

            {/* גריד ספרים */}
            {loading ? (
                <div className="flex flex-col justify-center items-center h-64 opacity-60">
                    <span className="material-symbols-outlined animate-spin text-5xl text-primary mb-4">progress_activity</span>
                    <p>טוען...</p>
                </div>
            ) : filteredBooks.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                    <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">library_books</span>
                    <h3 className="text-xl font-medium text-gray-600">אין כאן ספרים עדיין</h3>
                    <button 
                        onClick={() => setIsUploadModalOpen(true)}
                        className="mt-4 text-blue-600 font-bold hover:underline"
                    >
                        לחץ כאן להעלאת הספר הראשון
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredBooks.map(book => (
                        <PersonalBookCard key={book.id || book.path} book={book} />
                    ))}
                </div>
            )}
        </div>
      </main>

      {/* קומפוננטת המודל להעלאה */}
      {isUploadModalOpen && (
        <UploadModal 
            onClose={() => setIsUploadModalOpen(false)} 
            onSuccess={() => {
                setIsUploadModalOpen(false);
                fetchUserBooks(); // ריענון הרשימה אחרי העלאה מוצלחת
            }} 
        />
      )}
    </div>
  )
}

// --- תת-קומפוננטה: חלון העלאה (Modal) ---
function UploadModal({ onClose, onSuccess }) {
    const [file, setFile] = useState(null);
    const [bookName, setBookName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !bookName) return;

        setIsUploading(true);
        setStatus(null);

        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('bookName', bookName);

        try {
            const res = await fetch('/api/user/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setStatus({ type: 'success', msg: 'הועלה בהצלחה!' });
                setTimeout(() => {
                    onSuccess(); // סגירת המודל ורענון הדף
                }, 1000);
            } else {
                setStatus({ type: 'error', msg: data.error || 'שגיאה' });
                setIsUploading(false);
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'שגיאת תקשורת' });
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative">
                
                {/* כפתור סגירה */}
                <button onClick={onClose} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                    <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800 text-center">העלאת ספר חדש</h2>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">שם הספר</label>
                        <input
                            type="text"
                            value={bookName}
                            onChange={(e) => setBookName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="שם הספר..."
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">קובץ PDF</label>
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => setFile(e.target.files[0])}
                            className="block w-full text-sm text-gray-500 file:ml-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            required
                        />
                    </div>

                    {status && (
                        <div className={`text-sm text-center p-2 rounded ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {status.msg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isUploading}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50 flex justify-center gap-2"
                    >
                        {isUploading ? (
                            <>
                             <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                             מעלה...
                            </>
                        ) : 'העלה'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// --- תת-קומפוננטה: כרטיס ספר ---
function PersonalBookCard({ book }) {
  const total = book.totalPages || 0;
  const completed = book.completedPages || 0;
  const percent = total > 0 ? (completed / total) * 100 : 0;
  
  return (
    <Link 
        href={`/library/books/${encodeURIComponent(book.path)}`}
        className="group bg-white p-5 rounded-2xl border border-surface-variant hover:border-blue-300 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1 relative"
    >
        <span className="absolute top-4 left-4 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-full z-10">
            אישי
        </span>

        <div className="flex gap-4 mb-5">
            <div className="w-16 h-20 bg-gray-100 rounded-lg shadow-inner flex-shrink-0 flex items-center justify-center overflow-hidden">
                {book.thumbnail ? (
                    <img src={book.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="material-symbols-outlined text-3xl text-gray-300">folder_open</span>
                )}
            </div>
            <div className="flex-1 min-w-0 py-1">
                <h3 className="font-bold text-lg text-gray-800 line-clamp-2 leading-tight mb-1 group-hover:text-blue-600 transition-colors">
                    {book.name}
                </h3>
                <span className="text-xs text-gray-500">
                   {total} עמודים
                </span>
            </div>
        </div>

        <div className="mt-auto">
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
                <span>התקדמות</span>
                <span>{Math.round(percent)}%</span>
            </div>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100 mb-3">
                <div 
                    className={`h-full transition-all duration-500 ${percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                    style={{ width: `${percent}%` }} 
                />
            </div>
        </div>
    </Link>
  )
}