'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function PluginNotificationSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setMounted(true)
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/plugin-notifications')
      const data = await response.json()
      if (data.success) {
        setEnabled(data.enabled)
      }
    } catch (error) {
      console.error('Error loading plugin notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/admin/plugin-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })
      
      const data = await response.json()
      if (data.success) {
        onClose()
      }
    } catch (error) {
      console.error('Error saving plugin notification settings:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    const loadingContent = (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <div className="flex justify-center">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
          </div>
        </div>
      </div>
    )
    return mounted ? createPortal(loadingContent, document.body) : null
  }

  const modalContent = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }} onClick={onClose}>
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">extension</span>
            התראות על העלאת תוספים
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6">
          {/* הפעלה כללית */}
          <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <div>
              <h3 className="font-bold text-gray-800">קבלת התראות במייל</h3>
              <p className="text-sm text-gray-600 mt-1">
                קבל התראה כאשר משתמשים מעלים תוסף חדש לאוצריא
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* הסבר */}
          {enabled && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
                <div className="text-sm text-gray-700">
                  <p className="font-semibold mb-1">מה יקרה כעת?</p>
                  <ul className="space-y-1 pr-4">
                    <li>• תקבל מייל מיידי עם כל העלאת תוסף חדש</li>
                    <li>• המייל יכלול את פרטי התוסף והמעלה</li>
                    <li>• תוכל לעבור ישירות לניהול התוספים לאישור</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* כפתורי פעולה */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin">progress_activity</span>}
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
  
  return mounted ? createPortal(modalContent, document.body) : null
}
