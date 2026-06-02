'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState(null)
  const { showAlert, showConfirm } = useDialog()
  
  const [formData, setFormData] = useState({})

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users')
      const data = await response.json()
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const startEdit = (user) => {
      setEditingUser(user._id)
      setFormData({
          name: user.name,
          email: user.email,
          role: user.role,
          points: user.points,
          isSupervisor: !!user.isSupervisor,
          dictaEditBlocked: !!user.dictaEditBlocked
      })
  }

  const handleUpdateUser = async () => {
    const originalUser = users.find(u => u._id === editingUser);

    const performUpdate = async () => {
          try {
              const response = await fetch('/api/admin/users', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: editingUser, ...formData })
              });
            
              if (response.ok) {
                  setEditingUser(null);
                  loadUsers();
                  showAlert('הצלחה!', 'המשתמש עודכן בהצלחה');
              } else {
                  const data = await response.json();
                  showAlert('שגיאה', data.error || 'שגיאה בעדכון');
              }
          } catch (e) {
              showAlert('שגיאה', 'שגיאה בתקשורת');
          }
      };

      if (originalUser && formData.email !== originalUser.email) {
          showConfirm(
              'שינוי כתובת אימייל',
              "⚠️ שים לב: שינוי כתובת האימייל יגרום לביטול אימות המשתמש (V) והוא יידרש לאמת את המייל החדש.\n\nהאם אתה בטוח שברצונך להמשיך?",
              performUpdate
          );
      } else {
          await performUpdate();
      }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('למחוק את המשתמש?')) return
    try {
      await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      loadUsers()
    } catch (e) {
      showAlert('שגיאה', 'שגיאה במחיקה')
    }
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedUsers = [...users].sort((a, b) => {
    if (!sortConfig.key) return 0
    
    let aValue = a[sortConfig.key] || ''
    let bValue = b[sortConfig.key] || ''
    
    if (sortConfig.key === 'points' || sortConfig.key === 'completedPages' || sortConfig.key === 'dictaBooks') {
        aValue = Number(aValue) || 0
        bValue = Number(bValue) || 0
    }

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })

  const getSortIcon = (columnName) => {
    if (sortConfig.key !== columnName) return '↕'
    return sortConfig.direction === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-6 text-on-surface">ניהול משתמשים</h2>
      
      {loading ? (
        <LoadingSpinner message="טוען משתמשים..." />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full bg-white">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th 
                onClick={() => handleSort('name')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                שם {getSortIcon('name')}
              </th>
              <th 
                onClick={() => handleSort('email')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                אימייל {getSortIcon('email')}
              </th>
              <th 
                onClick={() => handleSort('role')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                תפקיד {getSortIcon('role')}
              </th>
              <th 
                onClick={() => handleSort('points')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                נקודות {getSortIcon('points')}
              </th>
              <th 
                onClick={() => handleSort('completedPages')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                עמודים שהושלמו {getSortIcon('completedPages')}
              </th>
              <th 
                onClick={() => handleSort('dictaBooks')}
                className="text-right p-4 font-bold text-gray-700 cursor-pointer hover:bg-gray-200 select-none"
              >
                ספרי דיקטה {getSortIcon('dictaBooks')}
              </th>
              <th className="text-right p-4 font-bold text-gray-700">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map(user => {
              const isEditing = editingUser === user._id
              return (
                <tr key={user._id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium">
                    {isEditing ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                      />
                    ) : user.name}
                  </td>
                  
                  {/* --- שינוי: הפיכת עמודת האימייל לניתנת לעריכה --- */}
                  <td className="p-4 text-sm text-gray-600 font-mono">
                    {isEditing ? (
                        <input
                            type="email"
                            dir="ltr" // חשוב כדי שהמייל יוצג נכון
                            className="border rounded px-2 py-1 w-full font-mono text-sm"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    ) : user.email}
                  </td>

                  <td className="p-4">
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <select
                          className="border rounded px-2 py-1 bg-white"
                          value={formData.role}
                          onChange={e => setFormData({ ...formData, role: e.target.value })}
                        >
                          <option value="user">משתמש</option>
                          <option value="admin">מנהל כללי</option>
                          <option value="admin_plugins">מנהל תוספים</option>
                          <option value="admin_books">מנהל ספרים</option>
                        </select>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={!!formData.isSupervisor}
                            onChange={e => setFormData({ ...formData, isSupervisor: e.target.checked })} />
                          מפקח (עריכה ישירה)
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap text-red-700">
                          <input type="checkbox" checked={!!formData.dictaEditBlocked}
                            onChange={e => setFormData({ ...formData, dictaEditBlocked: e.target.checked })} />
                          חסום מעריכה
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'admin_plugins' ? 'bg-blue-100 text-blue-800' :
                          user.role === 'admin_books' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role === 'admin' ? 'מנהל כללי' :
                           user.role === 'admin_plugins' ? 'מנהל תוספים' :
                           user.role === 'admin_books' ? 'מנהל ספרים' : 'משתמש'}
                        </span>
                        {user.isSupervisor && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">מפקח</span>}
                        {user.dictaEditBlocked && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">חסום מעריכה</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {isEditing ? (
                        <input
                            type="number"
                            className="border rounded px-2 py-1 w-20"
                            value={formData.points}
                            onChange={e => setFormData({ ...formData, points: e.target.value })}
                        />
                    ) : <span className="font-bold text-primary">{user.points || 0}</span>}
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
                        {user.completedPages || 0}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
                        {user.dictaBooks || 0}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    {isEditing ? (
                      <>
                        <button onClick={handleUpdateUser} className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg transition-colors">
                            <span className="material-symbols-outlined">check</span>
                        </button>
                        <button onClick={() => setEditingUser(null)} className="text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(user)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors">
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button 
                            onClick={() => handleDeleteUser(user._id)} 
                            className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={session?.user?.id === user._id}
                            title={session?.user?.id === user._id ? "לא ניתן למחוק את עצמך" : "מחק משתמש"}
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

