'use client'

// מודאל מודרציית דירוגים — צפייה בכל דירוגי התוסף והסתרה/החזרה של דירוג בודד.
// הסתרה אינה מוחקת: הדירוג נשאר במסד אך אינו נספר בממוצע, בהתפלגות ובציון המיון.
//
// Props:
// - plugin: { _id, name } — התוסף שדירוגיו מוצגים
// - onClose(aggregate): נקרא בסגירה; aggregate הוא נתוני הממוצע/כמות העדכניים ביותר
//   (אם עודכן דירוג כלשהו בזמן שהמודאל היה פתוח), או undefined אם לא היה שינוי.

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'
import { formatAdminDate } from '@/app/library/admin/plugins/formatAdminDate'

export default function PluginRatingsModal({ plugin, onClose }) {
  const { showAlert, showConfirm } = useDialog()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [processingId, setProcessingId] = useState(null)
  const aggregateRef = useRef(null) // האגרגט האחרון שחזר מהשרת — נמסר בסגירה לעדכון מקומי של הכרטיס
  const close = () => onClose(aggregateRef.current)

  const load = async () => {
    try {
      const response = await fetch(`/api/admin/plugins/${plugin._id}/ratings`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'טעינת הדירוגים נכשלה')
      setData(result)
    } catch (error) {
      console.error('Error loading plugin ratings:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לטעון את הדירוגים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin._id])

  const handleToggleHidden = async (rating) => {
    const hide = !rating.isHidden
    if (hide) {
      const confirmed = await showConfirm(
        'הסתרת דירוג',
        `להסתיר את הדירוג (${rating.value}★) של ${rating.userName}?\n\n` +
        'הדירוג יישאר במסד אך לא ייספר בממוצע ובסדר התצוגה בחנות. ניתן להחזירו בכל עת.'
      )
      if (!confirmed) return
    }

    try {
      setProcessingId(rating.id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}/ratings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratingId: rating.id, action: hide ? 'hide' : 'unhide' })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'הפעולה נכשלה')
      // עדכון מקומי מתוך תשובת השרת — אין צורך לטעון מחדש את כל הדירוגים
      aggregateRef.current = result.aggregate
      setData((prev) => prev && {
        ...prev,
        plugin: { ...prev.plugin, ...result.aggregate },
        ratings: prev.ratings.map((item) => (item.id === rating.id ? { ...item, ...result.rating } : item))
      })
    } catch (error) {
      showAlert('שגיאה', error.message || 'לא הצלחנו לעדכן את הדירוג')
    } finally {
      setProcessingId(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-bold text-on-surface">דירוגים: {plugin.name}</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4 p-6">
          {loading ? (
            <p className="text-center text-on-surface/50">טוען דירוגים...</p>
          ) : !data ? null : (
            <>
              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-surface p-4 text-sm">
                <span className="font-bold text-on-surface">
                  ממוצע מוצג: {data.plugin.ratingAvg.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-on-surface/60">{data.plugin.ratingCount} מדרגים</span>
                {data.plugin.ratingVerifiedCount > 0 && (
                  <span className="text-success-700">{data.plugin.ratingVerifiedCount} מאומתים</span>
                )}
                <span className="text-on-surface/60" title="הממוצע המוחלק שלפיו נקבע הסדר בחנות — פנימי, אינו מוצג למשתמשים">
                  ציון מיון: {data.plugin.ratingScore === null ? '—' : data.plugin.ratingScore.toLocaleString('he-IL', { maximumFractionDigits: 2 })}
                </span>
              </div>

              {data.ratings.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-on-surface/50">
                  התוסף עדיין לא דורג
                </p>
              ) : (
                <div className="space-y-2">
                  {data.ratings.map((rating) => (
                    <div
                      key={rating.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
                        rating.isHidden ? 'border-neutral-200 bg-neutral-100 opacity-70' : 'border-neutral-200 bg-surface'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-warning-500">
                            {'★'.repeat(rating.value)}
                            <span className="text-on-surface/25">{'★'.repeat(5 - rating.value)}</span>
                          </span>
                          <span className="truncate font-medium text-on-surface">{rating.userName}</span>
                          {rating.verifiedInstall && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">
                              <span className="material-symbols-outlined text-sm leading-none">verified</span>
                              <span>מאומת</span>
                            </span>
                          )}
                          {rating.isHidden && (
                            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-on-surface/60">
                              מוסתר{rating.hiddenByName ? ` ע"י ${rating.hiddenByName}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-on-surface/50">
                          {formatAdminDate(rating.updatedAt || rating.createdAt)}
                          {rating.pluginVersion ? ` · דורג בגרסה ${rating.pluginVersion}` : ''}
                          {rating.userEmail ? ` · ${rating.userEmail}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleHidden(rating)}
                        disabled={processingId === rating.id}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          rating.isHidden
                            ? 'bg-success-100 text-success-700 hover:bg-success-200'
                            : 'bg-danger-100 text-danger-700 hover:bg-danger-200'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {processingId === rating.id ? 'progress_activity' : rating.isHidden ? 'visibility' : 'visibility_off'}
                        </span>
                        <span>{rating.isHidden ? 'החזר' : 'הסתר'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
