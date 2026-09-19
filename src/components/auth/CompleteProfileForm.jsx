'use client'

// טופס השלמת הרשמה שהתחילה ב-Google: המייל כבר מאומת ומוצג לקריאה בלבד,
// והמשתמש בוחר שם משתמש ומאשר קבלת עדכונים (כמו בהרשמה הרגילה).
export default function CompleteProfileForm({
  email,
  name,
  onNameChange,
  acceptReminders,
  onAcceptRemindersChange,
  onSubmit,
  loading,
  error,
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6 text-right">
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">כתובת המייל שלך</label>
        <div className="flex items-center gap-2 w-full px-4 py-3 border border-surface-variant rounded-lg bg-surface-variant/30 text-on-surface/70">
          <span className="material-symbols-outlined text-success-600">verified</span>
          <span dir="ltr" className="flex-1 text-left">{email}</span>
        </div>
        <p className="text-xs text-on-surface/60 mt-1">אומתה על ידי Google — אין צורך באימות נוסף.</p>
      </div>

      <div>
        <label htmlFor="username" className="block text-sm font-medium text-on-surface mb-2">
          שם משתמש
        </label>
        <input
          id="username"
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full px-4 py-3 border border-surface-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-on-surface"
          placeholder="השם שיוצג באתר"
        />
        <p className="text-xs text-on-surface/60 mt-1">אפשר לשנות את ההצעה לשם אחר, בין 2 ל-50 תווים.</p>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptReminders}
          onChange={(e) => onAcceptRemindersChange(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm text-on-surface/80">
          אני מאשר/ת קבלת עדכונים ותזכורות במייל מאוצריא
        </span>
      </label>

      {error && (
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg flex items-center gap-2 text-danger-700">
          <span className="material-symbols-outlined">error</span>
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-lg font-medium hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="material-symbols-outlined animate-spin">progress_activity</span>
            <span>יוצר חשבון...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined">person_add</span>
            <span>יצירת החשבון</span>
          </>
        )}
      </button>
    </form>
  )
}
