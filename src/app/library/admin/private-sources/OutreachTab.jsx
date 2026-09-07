'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatusBadge from '@/components/status/StatusBadge'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import OutreachEditModal from './OutreachEditModal'
import {
  MATCH_REASON_LABELS,
  OPEN_OUTREACH_STATUSES,
  OUTREACH_STATUSES_CONFIG_KEY,
  RECENT_DUPLICATE_DAYS,
  describeDuplicate,
  findDuplicates,
} from '@/lib/institute-outreach'
import { formatDateShort } from '@/lib/formatDate'

const EMPTY = Object.freeze({})

/** תאריך קצר לתצוגה */
function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatDateShort(date)
}

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (onlyDuplicates && !duplicatesById.has(item._id)) return false
      if (!term) return true
      return [
        item.instituteName,
        item.contactName,
        item.contactPhone,
        item.contactEmail,
        item.outreachBy,
        item.subject,
      ].some((field) => (field || '').toLowerCase().includes(term))
    })
  }, [items, search, statusFilter, onlyDuplicates, duplicatesById])

  const stats = useMemo(() => {
    const byStatus = {}
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1
    }
    return {
      total: items.length,
      open: items.filter((item) => OPEN_OUTREACH_STATUSES.includes(item.status)).length,
      duplicates: duplicatesById.size,
      byStatus,
    }
  }, [items, duplicatesById])

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

function Chip({ label, value, tone = 'bg-surface-variant text-on-surface' }) {
  return (
    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${tone}`}>
      {label}: {value}
    </span>
  )
}

/** שורת פנייה, עם סימון כפילות כשקיימת פנייה אחרת לאותו נמען */
function OutreachRow({ item, statuses, channels, duplicates, onEdit }) {
  const channelLabel = item.channel ? channels?.[item.channel]?.label || item.channel : ''
  // כפילות "חמה": פנייה קרובה בזמן או פנייה שעדיין פתוחה
  const hotDuplicate = duplicates.find((dup) => dup.isRecent || dup.isOpen)

  return (
    <div className="px-5 py-3 hover:bg-surface-variant/30 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-on-surface truncate">
              {item.contactName || item.instituteName || 'ללא שם'}
            </span>
            {item.instituteName && item.contactName && (
              <span className="text-xs text-on-surface/60 truncate">({item.instituteName})</span>
            )}
            {hotDuplicate && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-100 text-danger-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] leading-none">warning</span>
                פנייה כפולה
              </span>
            )}
            {!hotDuplicate && duplicates.length > 0 && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700">
                פנייה נוספת בעבר
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface/50 truncate mt-0.5">
            {[item.contactPhone, item.contactEmail].filter(Boolean).join(' · ') || 'ללא פרטי קשר'}
            {item.subject ? ` · ${item.subject}` : ''}
          </p>
        </div>

        <div className="md:w-40 shrink-0">
          <StatusBadge status={item.status} statuses={statuses} />
        </div>

        <div className="md:w-40 shrink-0 text-sm text-on-surface/80 truncate">
          {item.outreachBy || '—'}
        </div>

        <div className="md:w-28 shrink-0 text-sm text-on-surface/60 truncate">
          {formatDate(item.outreachDate)}
        </div>

        <div className="md:w-24 shrink-0 text-sm text-on-surface/60 truncate">
          {channelLabel || '—'}
        </div>

        <button
          onClick={onEdit}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          עריכה
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-2 mr-1 text-xs text-on-surface/70 border-r-2 border-warning-300 pr-3 space-y-1">
          {duplicates.slice(0, 3).map((dup) => (
            <p key={dup._id}>
              גם {describeDuplicate(dup)} · {statuses?.[dup.status]?.label || dup.status} · התאמה
              לפי {MATCH_REASON_LABELS[dup.reason] || dup.reason}
            </p>
          ))}
          {duplicates.length > 3 && <p>ועוד {duplicates.length - 3} פניות…</p>}
          {hotDuplicate && (
            <p className="text-danger-700">
              פנייה חוזרת בתוך {RECENT_DUPLICATE_DAYS} ימים או בזמן שפנייה אחרת עדיין פתוחה.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
