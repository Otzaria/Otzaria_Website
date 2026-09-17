'use client'

import { useState } from 'react'
import { validatePassword, validateMatch, validateDifferent } from '@/lib/validation-utils'

/**
 * PasswordChangeModal - מודל שינוי סיסמה בדשבורד המשתמש
 *
 * מנהל באופן עצמאי את כל הסטייט של הטופס (שדות הסיסמה, הודעת שגיאה/הצלחה,
 * מצב טעינה, הצגה/הסתרה של הסיסמאות). ההורה אחראי רק להרכיב (mount) את
 * הקומפוננטה כאשר יש להציג אותה ולפרק אותה (unmount) כאשר יש לסגור אותה -
 * כך שבכל פתיחה מחדש הטופס מתחיל נקי, בדיוק כמו בהתנהגות המקורית.
 *
 * @param {() => void} onClose - נקרא כדי לסגור את המודל (גם בביטול וגם בהצלחה)
 * @param {(title: string, message: string) => void} showAlert - הצגת הודעת מערכת (מ-DialogContext)
 */
export default function PasswordChangeModal({ onClose, showAlert }) {
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleChangePassword = async () => {
    setPasswordMessage({ type: '', text: '' })

    if (!passwordFormData.currentPassword || !passwordFormData.newPassword || !passwordFormData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'נא למלא את כל השדות' })
      return
    }

    const passwordCheck = validatePassword(passwordFormData.newPassword, 8)
    if (!passwordCheck.isValid) {
      setPasswordMessage({ type: 'error', text: passwordCheck.error })
      return
    }

    const matchCheck = validateMatch(passwordFormData.newPassword, passwordFormData.confirmPassword, 'הסיסמאות החדשות')
    if (!matchCheck.isValid) {
      setPasswordMessage({ type: 'error', text: matchCheck.error })
      return
    }

    const differentCheck = validateDifferent(passwordFormData.currentPassword, passwordFormData.newPassword, 'הסיסמה החדשה')
    if (!differentCheck.isValid) {
      setPasswordMessage({ type: 'error', text: differentCheck.error })
      return
    }

    try {
      setLoadingPassword(true)
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordFormData.currentPassword,
          newPassword: passwordFormData.newPassword
        })
      })

      const result = await response.json()

      if (response.ok) {
        showAlert('הצלחה', 'הסיסמה שונתה בהצלחה!')
        setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' })
        onClose()
      } else {
        setPasswordMessage({ type: 'error', text: result.error || 'שגיאה בשינוי הסיסמה' })
      }
    } catch (error) {
      setPasswordMessage({ type: 'error', text: 'שגיאה בתקשורת' })
    } finally {
      setLoadingPassword(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-white glass-strong rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-surface-variant bg-white/50 rounded-t-2xl flex justify-between items-center">
          <h3 className="text-xl font-bold text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-primary">lock_reset</span>
            שינוי סיסמה
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-800"
            disabled={loadingPassword}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">סיסמה נוכחית</label>
            <div className="relative">
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordFormData.currentPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
                className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                placeholder="הזן סיסמה נוכחית"
                disabled={loadingPassword}
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

          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">סיסמה חדשה</label>
            <div className="relative">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordFormData.newPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                placeholder="הזן סיסמה חדשה (לפחות 8 תווים)"
                disabled={loadingPassword}
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

          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">אימות סיסמה חדשה</label>
            <div className="relative">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordFormData.confirmPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:border-primary bg-white text-on-surface shadow-sm"
                placeholder="הזן שוב את הסיסמה החדשה"
                disabled={loadingPassword}
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

          {passwordMessage.text && (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              passwordMessage.type === 'success'
                ? 'bg-success-100 text-success-800 border border-success-300'
                : 'bg-danger-100 text-danger-800 border border-danger-300'
            }`}>
              <span className="material-symbols-outlined">
                {passwordMessage.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <span>{passwordMessage.text}</span>
            </div>
          )}

          <div className="p-4 bg-primary-container/30 rounded-lg">
            <p className="text-sm text-on-surface/70 flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-lg">info</span>
              <span>
                <strong>טיפ אבטחה:</strong> השתמש בסיסמה חזקה המכילה אותיות, מספרים ותווים מיוחדים.
                אל תשתמש באותה סיסמה באתרים שונים.
              </span>
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
                onClick={onClose}
                disabled={loadingPassword}
                className="flex-1 px-4 py-2 border border-surface-variant text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
            >
                ביטול
            </button>
            <button
                onClick={handleChangePassword}
                disabled={loadingPassword}
                className="flex-[2] px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors flex items-center justify-center gap-2 font-bold shadow-md"
            >
                {loadingPassword ? (
                <>
                    <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    <span>משנה סיסמה...</span>
                </>
                ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">lock_reset</span>
                      <span>שנה סיסמה</span>
                    </>
                )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
