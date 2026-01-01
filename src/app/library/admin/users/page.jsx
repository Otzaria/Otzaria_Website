'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState(null)
  
  // הוספת State לטופס העריכה
  const [formData, setFormData] = useState({})

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
          role: user.role,
          points: user.points
      })
  }

  const handleUpdateUser = async () => {
    try {
      // התיקון: פנייה ל- /api/admin/users במקום /api/admin/users/update
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editingUser, ...formData })
      })
      
      if (response.ok) {
        setEditingUser(null)
        loadUsers() // רענון כדי לקבל נתונים מעודכנים
        alert('המשתמש עודכן בהצלחה')
      } else {
        const data = await response.json()
        alert(data.error || 'שגיאה בעדכון')
      }
    } catch (e) {
      alert('שגיאה בתקשורת')
    }
  }

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
      alert('שגיאה במחיקה')
    }
  }

  if (loading) return <div className="text-center p-10">טוען משתמשים...</div>

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-bold mb-6 text-on-surface">ניהול משתמשים</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full bg-white">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-right p-4 font-bold text-gray-700">שם</th>
              <th className="text-right p-4 font-bold text-gray-700">אימייל</th>
              <th className="text-right p-4 font-bold text-gray-700">תפקיד</th>
              <th className="text-right p-4 font-bold text-gray-700">נקודות</th>
              <th className="text-right p-4 font-bold text-gray-700">עמודים שהושלמו</th> 
              <th className="text-right p-4 font-bold text-gray-700">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
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
                  <td className="p-4 text-sm text-gray-600 font-mono">{user.email}</td>
                  <td className="p-4">
                    {isEditing ? (
                      <select
                        className="border rounded px-2 py-1 bg-white"
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                      >
                        <option value="user">משתמש</option>
                        <option value="admin">מנהל</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {user.role === 'admin' ? 'מנהל' : 'משתמש'}
                      </span>
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
                    {/* עמודה חדשה - מספר עמודים */}
                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
                        {user.completedPages || 0}
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
    </div>
  )
}