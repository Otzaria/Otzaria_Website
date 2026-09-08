'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import OutreachEditModal from './OutreachEditModal'
import Chip from './Chip'
import OutreachRow from './OutreachRow'
import { filterOutreachItems, computeOutreachStats } from './outreachFilters'
import { OUTREACH_STATUSES_CONFIG_KEY, findDuplicates } from '@/lib/institute-outreach'

const EMPTY = Object.freeze({})

/**
 * כרטיסיית "פניות למכונים": מי פנה לאיזה מכון/אדם, מתי, ומה יצא מזה —
 * כולל פניות שרק מתוכננות, כדי שכפילות תתגלה לפני הפנייה ולא אחריה.
 */
export default function OutreachTab() {
  const { data: session } = useSession()
  const { showAlert, showMessage, showConfirm } = useDialog()

  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState({})
  const [channels, setChannels] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)

  const [editing, setEditing] = useState(null) // רשומה לעריכה, או 'new'
  const [configOpen, setConfigOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/admin/institute-outreach', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בטעינה')
      setItems(data.items || [])
      setStatuses(data.statuses || {})
      setChannels(data.channels || {})
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // לכל פנייה — הפניות האחרות לאותו נמען (בסיס לסימון הכפילויות ברשימה)
  const duplicatesById = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const matches = findDuplicates(items, item, item._id)
      if (matches.length) map.set(item._id, matches)
    }
    return map
  }, [items])

  const filtered = useMemo(
    () => filterOutreachItems(items, { search, statusFilter, onlyDuplicates, duplicatesById }),
    [items, search, statusFilter, onlyDuplicates, duplicatesById]
  )

  const stats = useMemo(() => computeOutreachStats(items, duplicatesById), [items, duplicatesById])

  /**
   * שמירה. כשהשרת מחזיר 409 (כפילות שלא הופיעה ברשימה שנטענה) התשובה
   * מוחזרת למודאל כדי שיציג את הכפילות ויבקש אישור נוסף — ולא נזרקת כשגיאה.
   */
  const handleSave = async (payload) => {
    try {
      const response = await fetch('/api/admin/institute-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (response.status === 409 && data.duplicate) return data
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשמירה')

      setItems((prev) => {
        const exists = prev.some((item) => item._id === data.record._id)
        return exists
          ? prev.map((item) => (item._id === data.record._id ? data.record : item))
          : [data.record, ...prev]
      })
      setEditing(null)
      showAlert('נשמר', 'הפנייה נשמרה בהצלחה')
      return data
    } catch (saveError) {
      showMessage('שגיאה', saveError.message)
      return null
    }
  }

  const handleDelete = (item) => {
    showConfirm(
      'מחיקת פנייה',
      `למחוק את הפנייה ל"${item.contactName || item.instituteName}"?`,
      async () => {
        try {
          const response = await fetch(
            `/api/admin/institute-outreach?id=${encodeURIComponent(item._id)}`,
            { method: 'DELETE' }
          )
          const data = await response.json()
          if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה במחיקה')

          setItems((prev) => prev.filter((row) => row._id !== item._id))
          setEditing(null)
          showAlert('נמחק', 'הפנייה נמחקה')
        } catch (deleteError) {
          showMessage('שגיאה', deleteError.message)
        }
      },
      'מחק',
      'ביטול'
    )
  }

  const handleSaveStatuses = async (value) => {
    try {
      const response = await fetch('/api/admin/private-sources/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: OUTREACH_STATUSES_CONFIG_KEY, value }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשמירת ההגדרות')

      setStatuses(data.value)
      setConfigOpen(false)
      showAlert('נשמר', 'ההגדרות עודכנו')
    } catch (configError) {
      showMessage('שגיאה', configError.message)
    }
  }

  if (loading) {
    return (
      <div className="glass-strong p-6 rounded-xl">
        <LoadingSpinner message="טוען את רשימת הפניות..." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-strong p-6 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">contact_phone</span>
              פניות למכונים
            </h2>
            <p className="text-on-surface/60 text-sm mt-1">
              מי פנה לאיזה מכון ומתי. רשמו כאן גם פנייה שרק מתוכננת (״הולך ליצור קשר״) — כך אף אחד
              לא יפנה שוב לאותו אדם.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditing('new')}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">add</span>
              פנייה חדשה
            </button>
            <button
              onClick={() => setConfigOpen(true)}
              className="px-4 py-2 glass rounded-lg text-on-surface hover:bg-surface-variant flex items-center gap-2"
            >
              <span className="material-symbols-outlined">settings</span>
              סטטוסים
            </button>
            <button
              onClick={load}
              className="px-4 py-2 glass rounded-lg text-on-surface hover:bg-surface-variant flex items-center gap-2"
            >
              <span className="material-symbols-outlined">refresh</span>
              רענון
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {stats.duplicates > 0 && (
          <div className="mt-4 text-sm text-warning-700 bg-warning-50 border border-warning-200 px-3 py-2 rounded flex items-center gap-2">
            <span className="material-symbols-outlined text-base">warning</span>
            {stats.duplicates} פניות מתאימות לנמען שכבר פנו אליו — לחצו על ״כפילויות בלבד״ לבדיקה.
          </div>
        )}

        {/* סיכום */}
        <div className="flex flex-wrap gap-2 mt-5">
          <Chip label="סה״כ פניות" value={stats.total} />
          <Chip label="פתוחות" value={stats.open} tone="bg-info-100 text-info-700" />
          <Chip
            label="חשד לכפילות"
            value={stats.duplicates}
            tone="bg-danger-100 text-danger-700"
          />
          {Object.entries(statuses).map(([key, config]) => (
            <span
              key={key}
              className="px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: config.color }}
            >
              {config.label}: {stats.byStatus[key] || 0}
            </span>
          ))}
        </div>

        {/* סינון */}
        <div className="flex flex-col md:flex-row gap-3 mt-5">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface/40">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי מכון, איש קשר, טלפון, מייל, מי פנה או נושא"
              className="w-full pr-10 pl-3 py-2 rounded-lg border border-surface-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-surface-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">כל הסטטוסים</option>
            {Object.entries(statuses).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-on-surface px-3">
            <input
              type="checkbox"
              checked={onlyDuplicates}
              onChange={(e) => setOnlyDuplicates(e.target.checked)}
              className="w-4 h-4"
            />
            כפילויות בלבד
          </label>
        </div>

        <p className="text-sm text-on-surface/60 mt-3">
          מוצגות {filtered.length} מתוך {stats.total} פניות
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-strong p-10 rounded-xl text-center text-on-surface/60">
          {items.length === 0
            ? 'עדיין לא נרשמו פניות. לחצו על "פנייה חדשה" כדי לרשום פנייה או כוונת פנייה.'
            : 'לא נמצאו פניות התואמות לסינון.'}
        </div>
      ) : (
        <div className="glass-strong rounded-xl overflow-hidden divide-y divide-surface-variant/50">
          {filtered.map((item) => (
            <OutreachRow
              key={item._id}
              item={item}
              statuses={statuses}
              channels={channels}
              duplicates={duplicatesById.get(item._id) || []}
              onEdit={() => setEditing(item)}
            />
          ))}
        </div>
      )}

      {editing && (
        <OutreachEditModal
          item={editing === 'new' ? null : editing}
          allItems={items}
          statuses={statuses}
          channels={channels}
          defaultOutreachBy={session?.user?.name || session?.user?.email || ''}
          onSave={handleSave}
          onDelete={() => editing !== 'new' && handleDelete(editing)}
          onClose={() => setEditing(null)}
        />
      )}

      {configOpen && (
        <StatusConfigModal
          statuses={statuses || EMPTY}
          uploads={items.map((item) => ({ bookStatus: item.status }))}
          usageNoun="פניות"
          defaultKey=""
          title="הגדרות סטטוסים של פניות"
          itemNoun="סטטוס"
          itemNounPlural="סטטוסים"
          deleteConfirmBody={
            'אם תמחק את הסטטוס, הפניות האלה יישארו עם סטטוס לא תקין.\n\nמומלץ לעדכן אותן לפני המחיקה.'
          }
          deleteConfirmQuestion="האם אתה בטוח שברצונך למחוק את הסטטוס?"
          onSave={handleSaveStatuses}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
