'use client'

import { useState, useEffect } from 'react'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch('/api/admin/stats')
        const data = await response.json()
        if (data.success) {
          setStats(data.stats)
        }
      } catch (error) {
        console.error('Error loading stats:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  if (loading) return <div className="text-center p-10">טוען נתונים...</div>

  return (
    <div className="space-y-6">
      {/* כרטיסי מידע עליונים */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <StatCard icon="group" color="text-blue-600" value={stats?.users?.total} label="משתמשים" />
        <StatCard icon="menu_book" color="text-green-600" value={stats?.books?.total} label="ספרים" />
        <StatCard icon="description" color="text-purple-600" value={stats?.totalPages} label="סה״כ עמודים" />
        <StatCard icon="check_circle" color="text-yellow-600" value={`${stats?.completionRate}%`} label="אחוז השלמה" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass-strong p-6 rounded-xl">
            <h2 className="text-2xl font-bold mb-6 text-on-surface">סטטיסטיקות כלליות</h2>
            <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-surface rounded-lg">
                    <span className="text-on-surface">דפים שהושלמו</span>
                    <span className="text-2xl font-bold text-green-600">{stats?.completedPages}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-surface rounded-lg">
                    <span className="text-on-surface">דפים בטיפול</span>
                    <span className="text-2xl font-bold text-blue-600">{stats?.inProgressPages}</span>
                </div>
            </div>
        </div>
        
        {/* אפשר להוסיף כאן גרפים או רשימת משתמשים מובילים בעתיד */}
        <div className="glass-strong p-6 rounded-xl flex items-center justify-center text-on-surface/60">
            <p>גרפים ונתונים נוספים יופיעו כאן</p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, color, value, label }) {
  return (
    <div className="glass p-6 rounded-xl">
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined text-4xl ${color}`}>
          {icon}
        </span>
        <div>
          <p className="text-3xl font-bold text-on-surface">{value || 0}</p>
          <p className="text-on-surface/70 text-sm">{label}</p>
        </div>
      </div>
    </div>
  )
}