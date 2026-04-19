'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import WeeklyProgressChart from '@/components/data-display/WeeklyProgressChart'
import { statusConfig } from '@/lib/library-data'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function LibraryBooksPage() {
  const [treeData, setTreeData] = useState([])
  const [flatBooks, setFlatBooks] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('all')
  
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('available')
  
  useEffect(() => {
    const fetchData = async () => {
        try {
            const [treeRes, listRes, catsRes] = await Promise.all([
                fetch('/api/library'),
                fetch('/api/library/list'),
                fetch('/api/admin/categories') 
            ]);
            
            const treeJson = await treeRes.json();
            const listJson = await listRes.json();
            let catsJson = { success: false, categories: [] };
            try { catsJson = await catsRes.json(); } catch(e) {}

            if (treeJson.success) setTreeData(treeJson.data);
            if (listJson.success) setFlatBooks(listJson.books);
            if (catsJson.success) setCategories(catsJson.categories);

        } catch (err) {
            console.error('Error fetching library data:', err);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [])

  const filteredBooks = useMemo(() => {
    let data = flatBooks;

    data = data.filter(book => !book.isPrivate && !book.ownerId);

    if (searchTerm) {
      data = data.filter(book => 
        book.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterCategory !== 'all') {
        data = data.filter(book => book.category === filterCategory);
    }

    // 2. סינון לפי סטטוס
    if (filterStatus !== 'all') {
      data = data.filter(book => {
        if (filterStatus === 'available') return (book.availablePages || 0) > 0;
        if (filterStatus === 'in-progress') return (book.inProgressPages || 0) > 0;
        if (filterStatus === 'completed') return book.status === 'completed' || (book.totalPages > 0 && book.completedPages === book.totalPages);
        return true;
      });
    }

    return data
  }, [flatBooks, searchTerm, filterStatus, filterCategory]) // הוספנו את filterCategory לתלויות

  return (
    <div className="min-h-screen flex flex-col bg-background pb-12">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8">
            
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                
                <div className="flex-1 flex flex-col gap-6">
                    <div>
                      <h1 className="text-4xl font-bold text-foreground font-frank mb-2">
                        הספרייה
                      </h1>
                      <p className="text-on-surface/60 text-lg">
                        {flatBooks.length} ספרים זמינים
                      </p>
                    </div>
                    
                    {/* Search & Filter Controls */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="חפש ספר..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-4 py-3 pr-10 rounded-xl border-2 border-surface-variant bg-white focus:outline-none focus:border-primary shadow-sm transition-all"
                            />
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                search
                            </span>
                        </div>

                        {/* --- שינוי 3: הוספת דרופדאון קטגוריות --- */}
                        <div className="min-w-[180px]">
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="w-full h-full px-4 py-3 rounded-xl border-2 border-surface-variant bg-white focus:outline-none focus:border-primary shadow-sm transition-all appearance-none cursor-pointer"
                                style={{ backgroundImage: 'none' }} // מבטל את החץ הדיפולטיבי אם רוצים לעצב לבד, או להשאיר רגיל
                            >
                                <option value="all">כל הקטגוריות</option>
                                {categories.map((cat, index) => (
                                    <option key={cat._id || index} value={cat.name}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Filter Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                            {['available', 'in-progress', 'completed'].map(key => {
                                const config = statusConfig[key]
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setFilterStatus(key)}
                                        className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 whitespace-nowrap text-sm border-2 transition-all ${filterStatus === key 
                                            ? 'bg-primary text-on-primary border-primary' 
                                            : 'bg-white text-on-surface border-surface-variant hover:border-primary/50'}`}
                                    >
                                        <span className="material-symbols-outlined text-lg">{config.icon}</span>
                                        <span>{config.label}</span>
                                    </button>
                                )
                            })}
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap text-sm border-2 transition-all ${filterStatus === 'all' 
                                    ? 'bg-primary text-on-primary border-primary' 
                                    : 'bg-white text-on-surface border-surface-variant hover:border-primary/50'}`}
                            >
                                כל הספרים
                            </button>
                        </div>
                    </div>
                </div>

                <div className="w-full lg:w-[340px] flex-shrink-0">
                    <WeeklyProgressChart />
                </div>
            </div>

            {loading ? (
                <LoadingSpinner message="טוען את הספרייה..." />
            ) : (
                <>
                    <div className="flex items-center justify-between border-b border-surface-variant pb-3">
                        <span className="text-on-surface/70 font-medium">
                            נמצאו {filteredBooks.length} ספרים
                        </span>
                    </div>

                    {filteredBooks.length === 0 ? (
                        <div className="text-center py-20 bg-surface/30 rounded-2xl border-2 border-dashed border-surface-variant">
                            <span className="material-symbols-outlined text-6xl text-on-surface/20 mb-4">search_off</span>
                            <p className="text-lg text-on-surface/60">לא נמצאו ספרים התואמים את הסינון</p>
                            <button 
                                onClick={() => {setSearchTerm(''); setFilterStatus('all'); setFilterCategory('all');}}
                                className="mt-6 px-6 py-2 bg-white border border-surface-variant text-primary rounded-lg hover:bg-surface-variant transition-colors font-medium"
                            >
                                נקה סינון
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredBooks.map(book => (
                                <BookCard key={book.id || book.path} book={book} categories={categories} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
      </main>
    </div>
  )
}

function BookCard({ book, categories }) {
    // ... (הקוד של BookCard נשאר ללא שינוי)
    // אני לא מעתיק אותו כאן כדי לחסוך מקום, אבל תשאיר אותו כמו שהוא בקובץ המקורי
    const total = book.totalPages || 0;
    const completed = book.completedPages || 0;
    const inProgress = book.inProgressPages || 0;
    const available = Math.max(0, total - completed - inProgress);
  
    const completedPercent = total > 0 ? (completed / total) * 100 : 0;
    const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;
  
    const categoryData = categories?.find(c => c.name === (book.category || 'כללי'));
    
    const bgStyle = categoryData ? { backgroundColor: categoryData.color } : {};
    
    const bgClass = categoryData 
        ? 'shadow-sm text-black' 
        : 'bg-surface border border-surface-variant/50 text-black';
    
    return (
      <Link 
          href={`/library/books/${encodeURIComponent(book.path)}`}
          className="group bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/50 hover:shadow-lg transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1"
      >
          {/* Top Section */}
          <div className="flex gap-4 mb-5">
              <div className="w-16 h-20 bg-surface-variant rounded-lg shadow-sm overflow-hidden flex-shrink-0 relative group-hover:shadow-md transition-shadow">
                  {book.isHidden && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-bl-md z-10 font-bold shadow-sm">
                        מוסתר
                    </span>
                  )}
                  {book.thumbnail ? (
                      <img src={book.thumbnail} alt={book.name} className="w-full h-full object-cover" />
                  ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface text-on-surface/20">
                          <span className="material-symbols-outlined text-3xl">auto_stories</span>
                      </div>
                  )}
              </div>
              <div className="flex-1 min-w-0 py-0.5">
                  <h3 className="font-bold text-lg text-on-surface line-clamp-2 leading-tight mb-2 font-frank group-hover:text-primary transition-colors" title={book.name}>
                      {book.name}
                  </h3>
                  
                  <span 
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-bold ${bgClass}`}
                      style={bgStyle}
                  >
                      {book.category || 'כללי'}
                  </span>
              </div>
          </div>
  
          {/* Bottom Section: Progress Bar */}
          <div className="mt-auto">
              <div className="flex justify-between text-[11px] text-on-surface/50 mb-1.5 px-0.5">
                  <span>סטטוס עמודים</span>
                  <span>{total} סה"כ</span>
              </div>
  
              {/* The Visual Bar */}
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 mb-3 shadow-inner">
                  {completed > 0 && (
                      <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${completedPercent}%` }} />
                  )}
                  {inProgress > 0 && (
                      <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${inProgressPercent}%` }} />
                  )}
              </div>
  
              {/* Legend / Numbers */}
              <div className="flex justify-between items-center text-xs font-medium border-t border-surface-variant/50 pt-3">
                  <div className="flex items-center gap-1.5 text-green-700" title="הושלמו">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>{completed}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-700" title="בטיפול">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span>{inProgress}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500" title="פנויים">
                      <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                      <span>{available}</span>
                  </div>
              </div>
          </div>
      </Link>
    )
}
