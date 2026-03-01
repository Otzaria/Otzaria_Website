'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function UploadNotificationSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [settings, setSettings] = useState({
    enabled: false,
    dicta: false,
    fullBook: false,
    singlePage: false
  })

  useEffect(() => {
    setMounted(true)
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/upload-notifications')
      const data = await response.json()
      if (data.success) {
        setSettings(data.notifications)
      }
    } catch (error) {
      console.error('Error loading notification settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/admin/upload-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      
      const data = await response.json()
      if (data.success) {
        onClose()
      }
    } catch (error) {
      console.error('Error saving notification settings:', error)
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
            <span className="material-symbols-outlined text-primary">notifications</span>
            התראות על העלאות
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
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <h3 className="font-bold text-gray-800">קבלת התראות במייל</h3>
              <p className="text-sm text-gray-600 mt-1">
                קבל התראה כאשר משתמשים מעלים תוכן חדש
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* סוגי העלאות */}
          {settings.enabled && (
            <div className="space-y-3 pr-4 border-r-4 border-blue-300">
              <p className="text-sm font-bold text-gray-700 mb-3">בחר סוגי העלאות:</p>
              
              {/* דיקטה */}
              <label className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-purple-600">mic</span>
                  <div>
                    <h4 className="font-semibold text-gray-800">דיקטה</h4>
                    <p className="text-xs text-gray-600">המרת ספרי דיקטה לאוצריא</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.dicta}
                  onChange={(e) => setSettings({ ...settings, dicta: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                />
              </label>

              {/* ספר שלם */}
              <label className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200 cursor-pointer hover:bg-green-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-600">menu_book</span>
                  <div>
                    <h4 className="font-semibold text-gray-800">ספר שלם</h4>
                    <p className="text-xs text-gray-600">העלאת ספר מלא</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.fullBook}
                  onChange={(e) => setSettings({ ...settings, fullBook: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
              </label>

              {/* עמוד בודד */}
              <label className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-600">description</span>
                  <div>
                    <h4 className="font-semibold text-gray-800" >עמוד אחרון בספר</h4>
                    <p className="text-xs text-gray-600">עריכת עמוד אחרון בספר קיים</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.singlePage}
                  onChange={(e) => setSettings({ ...settings, singlePage: e.target.checked })}
                  className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                />
              </label>
            </div>
          )}
        </div>

        {/* כפתורי פעולה */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-primary text-white rounded-lg font-bold hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
