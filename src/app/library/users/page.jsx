'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer' // וודא שהקומפוננטה קיימת בפרויקט
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('points') // points, name, date
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const usersPerPage = 40

  useEffect(() => {
    loadUsers()
  }, [])

  // איפוס עמוד בעת חיפוש
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, sortBy])

  const loadUsers = async () => {
    try {
      setLoading(true)
      // שימוש ב-API הציבורי שיצרנו
      const response = await fetch('/api/users/list')
      const result = await response.json()
      
      if (result.success) {
        setUsers(result.users)
      }
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  // סינון ומיון
  const processUsers = () => {
    let processed = [...users];

    // 1. חיפוש
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        processed = processed.filter(user => 
            (user.name && user.name.toLowerCase().includes(query)) ||
            (user.email && user.email.toLowerCase().includes(query))
        );
    }

    // 2. מיון
    processed.sort((a, b) => {
      switch (sortBy) {
        case 'points':
          // מיון משני לפי שם אם הנקודות זהות
          if (b.points === a.points) {
              return a.name.localeCompare(b.name, 'he');
          }
          return b.points - a.points;
        case 'name':
          return a.name.localeCompare(b.name, 'he');
        case 'date':
          return new Date(b.createdAt) - new Date(a.createdAt);
        default:
          return 0;
      }
    });

    return processed;
  }

  const sortedAndFilteredUsers = processUsers();

  // Pagination
  const totalPages = Math.ceil(sortedAndFilteredUsers.length / usersPerPage)
  const startIndex = (currentPage - 1) * usersPerPage
  const paginatedUsers = sortedAndFilteredUsers.slice(startIndex, startIndex + usersPerPage)

  const formatJoinDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffDays === 0) return 'הצטרף היום'
    if (diffDays === 1) return 'הצטרף אתמול'
    if (diffDays < 7) return `הצטרף לפני ${diffDays} ימים`
    if (diffDays < 30) return `הצטרף לפני ${Math.floor(diffDays / 7)} שבועות`
    if (diffDays < 365) return `הצטרף לפני ${Math.floor(diffDays / 30)} חודשים`
    return `הצטרף לפני ${Math.floor(diffDays / 365)} שנים`
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-7xl mx-auto">
            
            {/* כותרת וסטטיסטיקה */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
              <div>
                <h1 className="text-4xl font-bold text-on-surface font-frank">קהילת העורכים</h1>
                <p className="text-on-surface/60 mt-2">
                    {users.length} משתמשים רשומים תורמים לפרויקט
                </p>
              </div>

               {/* חיפוש */}
               <div className="relative w-full md:w-96">
                <input
                    type="text"
                    placeholder="חפש לפי שם או אימייל..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-surface-variant bg-white focus:outline-none focus:ring-2 focus:ring-primary shadow-sm transition-all"
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    search
                </span>
               </div>
            </div>

            {/* סרגל כלים - מיון */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
                <span className="text-sm font-bold text-on-surface/70 ml-2">מיין לפי:</span>
                <button
                  onClick={() => setSortBy('points')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    sortBy === 'points'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface text-on-surface hover:bg-surface-variant border border-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">emoji_events</span>
                  נקודות
                </button>
                <button
                  onClick={() => setSortBy('name')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    sortBy === 'name'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface text-on-surface hover:bg-surface-variant border border-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">sort_by_alpha</span>
                  שם
                </button>
                <button
                  onClick={() => setSortBy('date')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    sortBy === 'date'
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface text-on-surface hover:bg-surface-variant border border-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">calendar_today</span>
                  תאריך הצטרפות
                </button>
            </div>

            {/* Users Grid */}
            {loading ? (
              <div className="text-center py-20">
                <span className="material-symbols-outlined animate-spin text-6xl text-primary/50">
                  progress_activity
                </span>
                <p className="mt-4 text-on-surface/60">טוען את נבחרת העורכים...</p>
              </div>
            ) : sortedAndFilteredUsers.length === 0 ? (
                <div className="text-center py-20 glass rounded-xl">
                    <span className="material-symbols-outlined text-6xl text-on-surface/20 mb-4">search_off</span>
                    <p className="text-lg text-on-surface/60">לא נמצאו משתמשים התואמים את החיפוש</p>
                </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {paginatedUsers.map((user, index) => {
                    const globalIndex = startIndex + index + 1;
                    const isTop3 = sortBy === 'points' && globalIndex <= 3 && !searchQuery; // הצג מדליות רק כשאין חיפוש והמיון לפי נקודות
                    
                    return (
                      <div
                        key={user.id}
                        className="group glass p-4 rounded-xl hover:shadow-lg transition-all border border-transparent hover:border-primary/20 relative overflow-hidden"
                      >
                         {/* Rank Badge for Top 3 */}
                         {isTop3 && (
                            <div className={`absolute top-0 left-0 w-16 h-16 flex items-start justify-end p-2 bg-gradient-to-br ${
                                globalIndex === 1 ? 'from-yellow-400/20 to-transparent text-yellow-600' :
                                globalIndex === 2 ? 'from-gray-300/20 to-transparent text-gray-500' :
                                'from-orange-400/20 to-transparent text-orange-600'
                            }`}>
                                <span className="material-symbols-outlined text-2xl">workspace_premium</span>
                            </div>
                         )}

                        <div className="flex items-start gap-4 relative z-10">
                          {/* Avatar */}
                          <div 
                            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-md ring-2 ring-white"
                            style={{ backgroundColor: getAvatarColor(user.name) }}
                          >
                            {getInitial(user.name)}
                          </div>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-lg text-on-surface truncate pr-1" title={user.name}>
                                {user.name}
                                </h3>
                                {user.role === 'admin' && (
                                    <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">
                                        מנהל
                                    </span>
                                )}
                            </div>
                            
                            <p className="text-xs text-on-surface/50 mb-2">
                              {formatJoinDate(user.createdAt)}
                            </p>

                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-variant/50">
                                <div className="text-center">
                                    <span className="block text-lg font-bold text-primary leading-none">
                                        {user.points?.toLocaleString() || 0}
                                    </span>
                                    <span className="text-[10px] text-on-surface/60">נקודות</span>
                                </div>
                                <div className="w-px h-6 bg-surface-variant"></div>
                                <div className="text-center">
                                    <span className="block text-lg font-bold text-blue-600 leading-none">
                                        {user.completedPages?.toLocaleString() || 0}
                                    </span>
                                    <span className="text-[10px] text-on-surface/60">דפים</span>
                                </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-12">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-surface-variant"
                    >
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>

                    <div className="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          if (totalPages <= 7) return true;
                          if (page === 1 || page === totalPages) return true;
                          if (Math.abs(page - currentPage) <= 1) return true;
                          return false;
                        })
                        .map((page, idx, arr) => {
                          const showEllipsisBefore = idx > 0 && page - arr[idx - 1] > 1
                          return (
                            <div key={page} className="flex items-center gap-1">
                              {showEllipsisBefore && (
                                <span className="px-2 text-on-surface/50">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                                  currentPage === page
                                    ? 'bg-primary text-on-primary shadow-md'
                                    : 'bg-surface hover:bg-surface-variant text-on-surface border border-surface-variant'
                                }`}
                              >
                                {page}
                              </button>
                            </div>
                          )
                        })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg bg-surface hover:bg-surface-variant disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-surface-variant"
                    >
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}