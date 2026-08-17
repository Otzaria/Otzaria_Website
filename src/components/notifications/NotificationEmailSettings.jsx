'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function NotificationEmailSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setMounted(true)
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/notification-email')
      const data = await response.json()
      if (data.success) {
        setNotificationEmail(data.notificationEmail || '')
        setAccountEmail(data.accountEmail || '')
      }
    } catch (error) {
      console.error('Error loading notification email:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      const response = await fetch('/api/user/notification-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmail: notificationEmail.trim() })
      })

      const data = await response.json()
      if (data.success) {
        onClose()
      } else {
        setError(data.error || 'שמירת הכתובת נכשלה')
      }
    } catch (error) {
      console.error('Error saving notification email:', error)
      setError('שמירת הכתובת נכשלה')
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
          <h2 className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-info-alt-600">forward_to_inbox</span>
            כתובת מייל להתראות
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-info-alt-50 rounded-lg border border-info-alt-200">
            <h3 className="font-bold text-neutral-800">לאן יישלחו ההתראות</h3>
            <p className="text-sm text-neutral-600 mt-1">
              לכתובת זו יישלחו התראות על דיווחי משתמשים על התוספים שלך.
              אם השדה ריק, ההתראות יישלחו לכתובת החשבון.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-800 mb-2" htmlFor="notification-email">
              כתובת להתראות
            </label>
            <input
              id="notification-email"
              type="email"
              dir="ltr"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder={accountEmail}
              className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:border-info-alt-600 text-neutral-800"
            />
            {accountEmail && (
              <p className="text-sm text-neutral-600 mt-2">
                כתובת החשבון: <span dir="ltr">{accountEmail}</span>
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-info-alt-600 text-white rounded-lg font-bold hover:bg-info-alt-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <span className="material-symbols-outlined animate-spin">progress_activity</span>}
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-neutral-200 text-neutral-700 rounded-lg font-bold hover:bg-neutral-300 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )

  return mounted ? createPortal(modalContent, document.body) : null
}
