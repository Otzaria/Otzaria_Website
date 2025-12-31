'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import LibraryTree from '@/components/LibraryTree' // ייבוא העץ

export default function LibraryBooksPage() {
  const [treeData, setTreeData] = useState([])
  const [flatBooks, setFlatBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)

  useEffect(() => {
    // טעינת עץ הקטגוריות והספרים
    const fetchData = async () => {
        try {
            const [treeRes, listRes] = await Promise.all([
                fetch('/api/library'),      // מחזיר מבנה עץ
                fetch('/api/library/list')  // מחזיר רשימה שטוחה לחיפוש מהיר
            ]);
            
            const treeJson = await treeRes.json();
            const listJson = await listRes.json();

            if (treeJson.success) setTreeData(treeJson.data);
            if (listJson.success) setFlatBooks(listJson.books);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [])

  // פונקציה לטיפול בלחיצה על פריט בעץ
  const handleTreeClick = (item) => {
      // אם זה קובץ (ספר), נווט אליו
      if (item.type === 'file') {
          window.location.href = `/library/book/${item.path}`; // או שימוש ב-router.push
      }
      // אם רוצים סינון לפי תיקייה, אפשר להוסיף לוגיקה כאן
  };

  // סינון ספרים (רק אם יש חיפוש פעיל, אחרת מציגים את העץ או הכל)
  const filteredBooks = flatBooks.filter(book => 
    book.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 h-[calc(100vh-64px)] overflow-hidden">
        <div className="flex flex-col h-full">
            {/* Search Bar Area */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'FrankRuehl, serif' }}>
                  הספרייה
                </h1>
                <div className="relative w-full md:w-96">
                    <input
                    type="text"
                    placeholder="חפש ספר..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 pr-10 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    search
                    </span>
                </div>
            </div>

            {loading ? (
            <div className="flex justify-center items-center h-full">
                <span className="material-symbols-outlined animate-spin text-5xl text-primary">progress_activity</span>
            </div>
            ) : (
                <div className="flex flex-1 gap-6 overflow-hidden">
                    
                    {/* צד ימין - עץ ניווט (מוסתר במובייל, מוצג בדסקטופ או כשאין חיפוש) */}
                    <div className={`w-full md:w-1/3 lg:w-1/4 bg-white rounded-xl border border-gray-200 overflow-y-auto p-4 custom-scrollbar ${searchTerm ? 'hidden md:block' : 'block'}`}>
                        <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">ניווט לפי נושאים</h3>
                        <LibraryTree items={treeData} onFileClick={handleTreeClick} />
                    </div>

                    {/* צד שמאל - תוצאות חיפוש או תצוגה ראשית */}
                    <div className="flex-1 bg-gray-50/50 rounded-xl border border-gray-200 overflow-y-auto p-6 custom-scrollbar">
                        {searchTerm ? (
                            <div>
                                <h3 className="font-bold text-lg mb-4">תוצאות חיפוש: {filteredBooks.length}</h3>
                                {filteredBooks.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500">
                                        <p>לא נמצאו ספרים התואמים את החיפוש</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {filteredBooks.map(book => (
                                            <Link 
                                                key={book.id} 
                                                href={`/library/book/${book.path}`}
                                                className="group bg-white p-4 rounded-xl border border-gray-200 hover:shadow-md transition-all hover:-translate-y-1 flex flex-col items-center text-center"
                                            >
                                                <div className="w-full aspect-[2/3] bg-gray-100 rounded-lg mb-3 relative overflow-hidden">
                                                    {book.thumbnail ? (
                                                        <img src={book.thumbnail} alt={book.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="material-symbols-outlined text-4xl text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">auto_stories</span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-gray-800 line-clamp-2" title={book.name}>{book.name}</span>
                                                <span className="text-xs text-gray-500 mt-1">{book.category}</span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <span className="material-symbols-outlined text-6xl text-primary/20 mb-4">library_books</span>
                                <h2 className="text-2xl font-bold text-gray-700 mb-2">ברוכים הבאים לספרייה</h2>
                                <p className="text-gray-500">אנא בחרו קטגוריה מהעץ מימין או חפשו ספר למעלה</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </main>
    </div>
  )
}