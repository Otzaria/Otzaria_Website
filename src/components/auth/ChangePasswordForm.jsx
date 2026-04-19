'use client'

import { useState } from 'react'
import { apiPost } from '@/lib/api-utils'
import { validatePassword, validateMatch, validateDifferent } from '@/lib/validation-utils'

export default function ChangePasswordForm() {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    // Client-side validation
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setMessage({ type: 'error', text: 'נא למלא את כל השדות' })
      return
    }

    // Validate new password strength
    const passwordCheck = validatePassword(formData.newPassword, 6)
    if (!passwordCheck.isValid) {
      setMessage({ type: 'error', text: passwordCheck.error })
      return
    }

    // Validate passwords match
    const matchCheck = validateMatch(formData.newPassword, formData.confirmPassword, 'הסיסמאות החדשות')
    if (!matchCheck.isValid) {
      setMessage({ type: 'error', text: matchCheck.error })
      return
    }

    // Validate passwords are different
    const differentCheck = validateDifferent(formData.currentPassword, formData.newPassword, 'הסיסמה החדשה')
    if (!differentCheck.isValid) {
      setMessage({ type: 'error', text: differentCheck.error })
      return
    }

    try {
      setLoading(true)
      const result = await apiPost('/api/user/change-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword
      })

      setMessage({ type: 'success', text: 'הסיסמה שונתה בהצלחה!' })
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'שגיאה בשינוי הסיסמה' })
    } finally {
      setLoading(false)
    }
  }

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="glass-strong p-8 rounded-2xl">
      <h2 className="text-2xl font-bold mb-6 text-on-surface flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">lock</span>
        שינוי סיסמה
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Current Password */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            סיסמה נוכחית
          </label>
          <div className="relative">
            <input
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
              placeholder="הזן סיסמה נוכחית"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('current')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-xl">
                {showPasswords.current ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            סיסמה חדשה
          </label>
          <div className="relative">
            <input
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
              placeholder="הזן סיסמה חדשה (לפחות 6 תווים)"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('new')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-xl">
                {showPasswords.new ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">
            אימות סיסמה חדשה
          </label>
          <div className="relative">
            <input
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
              placeholder="הזן שוב את הסיסמה החדשה"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('confirm')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/60 hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-xl">
                {showPasswords.confirm ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 border border-green-300' 
              : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            <span className="material-symbols-outlined">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary py-3 px-6 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span>משנה סיסמה...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">lock_reset</span>
              <span>שנה סיסמה</span>
            </>
          )}
        </button>
      </form>

      {/* Security Tips */}
      <div className="mt-6 p-4 bg-primary-container/30 rounded-lg">
        <p className="text-sm text-on-surface/70 flex items-start gap-2">
          <span className="material-symbols-outlined text-primary text-lg">info</span>
          <span>
            <strong>טיפ אבטחה:</strong> השתמש בסיסמה חזקה המכילה אותיות, מספרים ותווים מיוחדים. 
            אל תשתמש באותה סיסמה באתרים שונים.
          </span>
        </p>
      </div>
    </div>
  )
}