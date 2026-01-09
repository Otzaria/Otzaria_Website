'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import LibraryTree from '@/components/LibraryTree'
import WeeklyProgressChart from '@/components/WeeklyProgressChart'
import { statusConfig } from '@/lib/library-data'

export default function LibraryBooksPage() {
  const [treeData, setTreeData] = useState([])
  const [flatBooks, setFlatBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  
  useEffect(() => {
    const fetchData = async () => {
        try {
            const [treeRes, listRes] = await Promise.all([
                fetch('/api/library'),
                fetch('/api/library/list')
            ]);
            
            const treeJson = await treeRes.json();
            const listJson = await listRes.json();

            if (treeJson.success) setTreeData(treeJson.data);
            if (listJson.success) setFlatBooks(listJson.books);
        } catch (err) {
            console.error('Error fetching library data:', err);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [])

  const handleTreeClick = (item) => {
      if (item.type === 'file') {
          window.location.href = `/library/book/${item.path}`;
      }
  };

  const filteredBooks = useMemo(() => {
    let data = flatBooks;

    // 1. סינון לפי טקסט (חיפוש)
    if (searchTerm) {
      data = data.filter(book => 
        book.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 2. סינון לפי סטטוס
    if (filterStatus !== 'all') {
      data = data.filter(book => {
        if (filterStatus === 'available') {
          // זמין לעריכה = יש לפחות עמוד אחד פנוי
          return (book.availablePages || 0) > 0;
        }
        if (filterStatus === 'in-progress') {
          // בטיפול = יש עמודים בטיפול, ועדיין לא הושלם לגמרי
          return (book.inProgressPages || 0) > 0;
        }
        if (filterStatus === 'completed') {
          // הושלם = כל העמודים הושלמו
          return book.status === 'completed' || (book.totalPages > 0 && book.completedPages === book.totalPages);
        }
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
            
            {/* Top Section: Header & Widget Layout */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                
                {/* Left Side: Header, Search, Filters (Grow to fill space) */}
                <div className="flex-1 flex flex-col gap-6">
                    <div>
                      <h1 className="text-4xl font-bold text-foreground font-frank mb-2">
                        הספרייה
                      </h1>
                      <p className="text-on-surface/60 text-lg">
                        {flatBooks.length} ספרים זמינים לעריכה ולימוד
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
                        
                        {/* Filter Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap text-sm border-2 transition-all ${filterStatus === 'all' 
                                    ? 'bg-primary text-on-primary border-primary' 
                                    : 'bg-white text-on-surface border-surface-variant hover:border-primary/50'}`}
                            >
                                כל הספרים
                            </button>
                            {Object.entries(statusConfig).map(([key, config]) => (
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
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Chart Widget (Fixed Width on Desktop) */}
                <div className="w-full lg:w-[340px] flex-shrink-0">
                    <WeeklyProgressChart />
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col justify-center items-center h-64 opacity-60">
                    <span className="material-symbols-outlined animate-spin text-5xl text-primary mb-4">progress_activity</span>
                    <p>טוען את הספרייה...</p>
                </div>
            ) : (
                <>
                    {/* Results Info Bar */}
                    <div className="flex items-center justify-between border-b border-surface-variant pb-3">
                        <span className="text-on-surface/70 font-medium">
                            נמצאו {filteredBooks.length} ספרים
                        </span>
                    </div>

                    {/* Books Grid - Full Width */}
                    {filteredBooks.length === 0 ? (
                        <div className="text-center py-20 bg-surface/30 rounded-2xl border-2 border-dashed border-surface-variant">
                            <span className="material-symbols-outlined text-6xl text-on-surface/20 mb-4">search_off</span>
                            <p className="text-lg text-on-surface/60">לא נמצאו ספרים התואמים את הסינון</p>
                            <button 
                                onClick={() => {setSearchTerm(''); setFilterStatus('all');}}
                                className="mt-6 px-6 py-2 bg-white border border-surface-variant text-primary rounded-lg hover:bg-surface-variant transition-colors font-medium"
                            >
                                נקה סינון
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredBooks.map(book => (
                                <BookCard key={book.id || book.path} book={book} />
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

function BookCard({ book }) {
  const total = book.totalPages || 0;
  const completed = book.completedPages || 0;
  const inProgress = book.inProgressPages || 0;
  // available זה מה שנשאר
  const available = Math.max(0, total - completed - inProgress);

  // חישוב אחוזים
  const completedPercent = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;
  
  return (
    <Link 
        href={`/library/book/${encodeURIComponent(book.path)}`}
        className="group bg-white p-5 rounded-2xl border border-surface-variant hover:border-primary/50 hover:shadow-lg transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1"
    >
        {/* Top Section */}
        <div className="flex gap-4 mb-5">
            <div className="w-16 h-20 bg-surface-variant rounded-lg shadow-sm overflow-hidden flex-shrink-0 relative group-hover:shadow-md transition-shadow">
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
                <span className="inline-flex items-center text-xs text-on-surface/60 bg-surface px-2 py-0.5 rounded-md border border-surface-variant/50">
                    {book.category}
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