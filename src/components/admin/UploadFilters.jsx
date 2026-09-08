'use client'

import { useState, useEffect } from 'react'

/**
 * UploadFilters - שורת הסינון בדף ניהול העלאות: סינון לפי משתמש וסינון לפי סטטוס
 *
 * מנהלת באופן עצמאי את מצב הפתיחה/סגירה של שני התפריטים (dropdown) ואת
 * שדה החיפוש בתוך תפריט המשתמשים. הסגירה בלחיצה מחוץ לתפריט ממומשת בדיוק
 * כמו במקור - דרך event listener גלובלי על מסמך ה-DOM שבודק closest() לפי
 * class name (.user-filter-container / .filter-menu-container), כדי לשמר
 * התנהגות זהה ללא תלות ב-refs.
 *
 * ערכי הסינון עצמם (filterUsers, filterStatuses) ומקורות הנתונים
 * (uniqueUsers, bookStatuses) מגיעים כ-props מההורה, כיוון שההורה זקוק
 * להם גם עבור groupedByBook.
 *
 * Props:
 * - uniqueUsers: [{ name, email, key }]
 * - filterUsers: string[] - מפתחות המשתמשים שנבחרו לסינון
 * - setFilterUsers(updaterOrArray)
 * - bookStatuses: { [key]: { label, color } }
 * - filterStatuses: string[] - הסטטוסים שנבחרו לסינון
 * - setFilterStatuses(updaterOrArray)
 */
export default function UploadFilters({
  uniqueUsers,
  filterUsers,
  setFilterUsers,
  bookStatuses,
  filterStatuses,
  setFilterStatuses,
}) {
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  // סגירת dropdown משתמשים בלחיצה מחוץ
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserDropdown && !event.target.closest('.user-filter-container')) {
        setShowUserDropdown(false)
        setUserSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserDropdown])

  // סגירת תפריט סינון סטטוס בלחיצה מחוץ לתפריט
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterMenu && !event.target.closest('.filter-menu-container')) {
        setShowFilterMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterMenu])

  const handleStatusChange = (value, isChecked) => {
    setFilterStatuses(prev => {
      const newSet = new Set(prev)
      if (isChecked) {
        newSet.add(value)
      } else {
        newSet.delete(value)
      }
      return Array.from(newSet)
    })
  }

  const filteredUniqueUsers = uniqueUsers.filter(u =>
    !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())
  )

  return (
    <div className="flex gap-2 mb-6">

      {/* סינון לפי משתמש */}
      <div className="relative user-filter-container">
        <button
          onClick={() => setShowUserDropdown(!showUserDropdown)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${
            filterUsers.length > 0
              ? 'bg-info-alt-600 text-white'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">person_search</span>
          {filterUsers.length === 0 && 'סינון לפי משתמש'}
          {filterUsers.length === 1 && (uniqueUsers.find(u => u.key === filterUsers[0])?.name || filterUsers[0])}
          {filterUsers.length > 1 && `${filterUsers.length} משתמשים`}
          {filterUsers.length > 0 && (
            <span
              className="material-symbols-outlined text-sm hover:opacity-70"
              onClick={(e) => { e.stopPropagation(); setFilterUsers([]) }}
            >close</span>
          )}
          {filterUsers.length === 0 && (
            <span className="material-symbols-outlined text-sm">
              {showUserDropdown ? 'expand_less' : 'expand_more'}
            </span>
          )}
        </button>

        {showUserDropdown && (
          <div className="absolute top-full mt-2 right-0 bg-white border border-neutral-200 rounded-lg shadow-xl z-10 p-3 min-w-[230px]">
            <input
              type="text"
              placeholder="חיפוש משתמש..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              autoFocus
              className="w-full px-3 py-1.5 text-sm border border-neutral-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {filteredUniqueUsers.map(u => {
                  const selected = filterUsers.includes(u.key)
                  const emailPrefix = u.email ? u.email.split('@')[0] : ''
                  return (
                    <label
                      key={u.key}
                      className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 cursor-pointer ${
                        selected ? 'bg-info-alt-50 text-info-alt-700' : 'hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setFilterUsers(prev =>
                          selected ? prev.filter(k => k !== u.key) : [...prev, u.key]
                        )}
                        className="w-4 h-4 text-info-alt-600 rounded focus:ring-info-alt-500 flex-shrink-0"
                      />
                      <span className="flex-1">{u.name}</span>
                      {emailPrefix && <span className="text-xs text-neutral-400 truncate max-w-[70px]" title={u.email}>{emailPrefix}</span>}
                    </label>
                  )
                })}
              {filteredUniqueUsers.length === 0 && (
                <p className="text-sm text-neutral-400 text-center py-2">לא נמצאו משתמשים</p>
              )}
            </div>
            {filterUsers.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <button
                  onClick={() => setFilterUsers([])}
                  className="w-full px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                >
                  איפוס בחירה
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* לחצן סינון לסטטוס בלבד */}
      <div className="relative filter-menu-container">
        <button
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">filter_list</span>
          סינון לפי סטטוס
          {filterStatuses.length > 0 && (
            <span className="w-2 h-2 bg-info-600 rounded-full"></span>
          )}
          <span className="material-symbols-outlined text-sm">
            {showFilterMenu ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {/* תפריט סינון - רק סטטוס */}
        {showFilterMenu && (
          <div className="absolute top-full mt-2 right-0 bg-white border border-neutral-200 rounded-lg shadow-xl z-10 p-4 min-w-[300px]">
            <h3 className="text-sm font-bold text-neutral-700 mb-3 pb-2 border-b">סטטוס</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {Object.entries(bookStatuses).map(([key, config]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={filterStatuses.includes(key)}
                    onChange={(e) => handleStatusChange(key, e.target.checked)}
                    className="w-4 h-4 text-info-600 rounded focus:ring-info-500"
                  />
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: config.color }}
                  ></span>
                  <span className="text-sm text-neutral-700">{config.label}</span>
                </label>
              ))}
            </div>

            {/* כפתור איפוס */}
            {filterStatuses.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setFilterStatuses([])}
                  className="w-full px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                >
                  איפוס סינון
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
