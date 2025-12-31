'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState(null)

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

  const handleUpdateUser = async (userId, updates) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates })
      })
      if (response.ok) {
        setEditingUser(null)
        loadUsers()
      } else {
        alert('שגיאה בעדכון')
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
    <div className="glass-strong p-6 rounded-xl">
      <h2 className="text-2xl font-bold mb-6 text-on-surface">ניהול משתמשים</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-variant">
              <th className="text-right p-4">שם</th>
              <th className="text-right p-4">אימייל</th>
              <th className="text-right p-4">תפקיד</th>
              <th className="text-right p-4">נקודות</th>
              <th className="text-right p-4">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const isEditing = editingUser && editingUser._id === user._id
              return (
                <tr key={user._id} className="border-b border-surface-variant/50 hover:bg-surface-variant/30">
                  <td className="p-4">
                    {isEditing ? (
                      <input
                        className="border rounded px-2 py-1"
                        value={editingUser.name}
                        onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                      />
                    ) : user.name}
                  </td>
                  <td className="p-4">{user.email}</td>
                  <td className="p-4">
                    {isEditing ? (
                      <select
                        className="border rounded px-2 py-1"
                        value={editingUser.role}
                        onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
                      >
                        <option value="user">משתמש</option>
                        <option value="admin">מנהל</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 rounded text-sm ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100'}`}>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {isEditing ? (
                        <input
                            type="number"
                            className="border rounded px-2 py-1 w-20"
                            value={editingUser.points}
                            onChange={e => setEditingUser({ ...editingUser, points: e.target.value })}
                        />
                    ) : user.points || 0}
                  </td>
                  <td className="p-4 flex gap-2">
                    {isEditing ? (
                      <>
                        <button onClick={() => handleUpdateUser(user._id, { name: editingUser.name, role: editingUser.role, points: editingUser.points })} className="text-green-600">
                            <span className="material-symbols-outlined">check</span>
                        </button>
                        <button onClick={() => setEditingUser(null)} className="text-gray-600">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditingUser(user)} className="text-blue-600">
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button 
                            onClick={() => handleDeleteUser(user._id)} 
                            className="text-red-600"
                            disabled={session?.user?.id === user._id}
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