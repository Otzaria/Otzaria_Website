'use client'

import { useState } from 'react'
import { formatDateTime } from './labels'

/** ההתקנות הפעילות ביותר, עם חסימה/שחרור. onChanged נקרא אחרי שינוי מוצלח. */
export default function KeysTable({ keys, onChanged }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')

  const toggle = async (key) => {
    const action = key.status === 'blocked' ? 'unblock' : 'block'
    if (action === 'block' && !window.confirm('לחסום את ההתקנה? היא תפסיק לשלוח משוב.')) return
    setBusyKey(key.keyId)
    setError('')
    try {
      const res = await fetch(`/api/search-feedback/admin/keys/${encodeURIComponent(key.keyId)}/${action}`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'עדכון ההתקנה נכשל')
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 overflow-x-auto">
      <h3 className="mb-3 text-lg font-bold text-on-surface">ההתקנות הפעילות ביותר</h3>
      {error && <p className="mb-2 text-sm text-danger-600">{error}</p>}
      {keys.length === 0 ? (
        <p className="text-sm text-on-surface/60">אין התקנות רשומות</p>
      ) : (
        <table className="w-full text-right text-sm">
          <thead className="border-b border-surface-variant text-on-surface/60">
            <tr>
              <th className="p-2">מזהה</th>
              <th className="p-2">תוכנה</th>
              <th className="p-2">גרסה</th>
              <th className="p-2">אירועים</th>
              <th className="p-2">נראה לאחרונה</th>
              <th className="p-2">מצב</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const blocked = k.status === 'blocked'
              return (
                <tr key={k.keyId} className="border-b border-surface-variant/50">
                  <td className="p-2 font-mono text-xs" dir="ltr" title={k.keyId}>{k.keyId.slice(0, 12)}…</td>
                  <td className="p-2" dir="ltr">{k.app} / {k.platform}</td>
                  <td className="p-2" dir="ltr">{k.appVersionLast}</td>
                  <td className="p-2 font-bold">{k.eventCount.toLocaleString('he-IL')}</td>
                  <td className="p-2 text-on-surface/60">{formatDateTime(k.lastSeenAt)}</td>
                  <td className="p-2">{blocked ? <span className="font-bold text-danger-600">חסומה</span> : 'פעילה'}</td>
                  <td className="p-2">
                    <button
                      onClick={() => toggle(k)}
                      disabled={busyKey === k.keyId}
                      className="flex items-center gap-1 rounded-lg px-3 py-1 hover:bg-surface-variant disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-base">{blocked ? 'lock_open' : 'block'}</span>
                      <span>{blocked ? 'שחרר' : 'חסום'}</span>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
