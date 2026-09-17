import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { formatTimeAgo } from './reminderUtils'

/**
 * ReminderHistoryList - היסטוריית שליחות תזכורות אחרונות (דף admin/reminders)
 * חולץ מ-page.jsx ללא שינוי בהתנהגות.
 *
 * Props:
 * - loading: מציג LoadingSpinner במקום הרשימה
 * - history: רשימת פריטי ההיסטוריה
 * - onDelete(id): מחיקת פריט מההיסטוריה
 */
export default function ReminderHistoryList({ loading, history, onDelete }) {
  if (loading) {
    return (
      <div className="mt-12 border-t pt-8">
        <h2 className="text-xl font-bold text-neutral-800 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-neutral-500">history</span>
          היסטוריית שליחות אחרונות
        </h2>
        <LoadingSpinner message="טוען היסטוריה..." />
      </div>
    )
  }

  if (history.length === 0) {
    return null
  }

  return (
    <div className="mt-12 border-t pt-8">
      <h2 className="text-xl font-bold text-neutral-800 mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-neutral-500">history</span>
        היסטוריית שליחות אחרונות
      </h2>
      <div className="bg-neutral-50 rounded-xl border border-neutral-200 overflow-hidden">
        {history.map((item) => (
          <div key={item.id} className="p-4 border-b border-neutral-100 last:border-0 hover:bg-white transition-colors flex items-center justify-between group">
            <div>
              <div className="font-bold text-neutral-800 flex items-center gap-2">
                {item.bookName}
                {item.bookType === 'dicta' && (
                  <span className="text-xs bg-feature-100 text-feature-700 px-2 py-0.5 rounded-full">
                    דיקטה
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-500 flex items-center gap-2 flex-wrap">
                <span>נשלח על ידי: {item.adminName}</span>
                {item.isPartial && (
                  <span className="text-xs bg-warning-strong-100 text-warning-strong-700 px-2 py-0.5 rounded-full">
                    נשלח לחלק מהמשתמשים
                  </span>
                )}
                {item.bookType === 'dicta' && item.daysThreshold !== undefined && (
                  <span className="text-xs bg-info-100 text-info-700 px-2 py-0.5 rounded-full">
                    {item.daysThreshold === 0 ? 'כל הספרים' : `${item.daysThreshold}+ ימים`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-left">
                <div className="text-sm font-bold text-info-600 bg-info-50 px-2 py-1 rounded-md inline-block">
                  {formatTimeAgo(item.timestamp)}
                </div>
                <div className="text-xs text-neutral-400 mt-1" dir="ltr">
                  {new Date(item.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <button
                onClick={() => onDelete(item.id)}
                className="text-neutral-300 hover:text-danger-500 transition-colors p-2 rounded-full hover:bg-danger-50 opacity-0 group-hover:opacity-100"
                title="מחק מההיסטוריה"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
