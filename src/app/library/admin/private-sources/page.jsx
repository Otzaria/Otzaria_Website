'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatusBadge from '@/components/status/StatusBadge'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import SourceEditModal from './SourceEditModal'

const CONFIG_KEYS = {
  statuses: 'private_source_statuses',
  methods: 'private_source_permission_methods',
  platforms: 'private_source_platforms',
}

// הגדרות המודאל לכל אחת משלוש הרשימות הדינמיות
const CONFIG_MODALS = {
  statuses: {
    configKey: CONFIG_KEYS.statuses,
    title: 'הגדרות סטטוסים',
    itemNoun: 'סטטוס',
    itemNounPlural: 'סטטוסים',
    buttonLabel: 'סטטוסים',
    deleteConfirmBody:
      'אם תמחק את הסטטוס, הספרים האלה יישארו עם סטטוס לא תקין.\n\nמומלץ לעדכן אותם לפני המחיקה.',
    deleteConfirmQuestion: 'האם אתה בטוח שברצונך למחוק את הסטטוס?',
  },
  methods: {
    configKey: CONFIG_KEYS.methods,
    title: 'הגדרות אופני קבלת אישור',
    itemNoun: 'אופן',
    itemNounPlural: 'אופנים',
    buttonLabel: 'אופני אישור',
    deleteConfirmBody:
      'אם תמחק את האופן, הספרים האלה יישארו עם ערך לא תקין.\n\nמומלץ לעדכן אותם לפני המחיקה.',
    deleteConfirmQuestion: 'האם אתה בטוח שברצונך למחוק את האופן?',
  },
  platforms: {
    configKey: CONFIG_KEYS.platforms,
    title: 'הגדרות פלטפורמות',
    itemNoun: 'פלטפורמה',
    itemNounPlural: 'פלטפורמות',
    buttonLabel: 'פלטפורמות',
    // ניסוחים בלשון נקבה
    existingTitle: 'פלטפורמות קיימות',
    addTitle: 'הוספת פלטפורמה חדשה',
    assignedText: 'משויכת',
    deleteConfirmBody:
      'אם תמחק את הפלטפורמה, הספרים האלה יישארו עם ערך לא תקין.\n\nמומלץ לעדכן אותם לפני המחיקה.',
    deleteConfirmQuestion: 'האם אתה בטוח שברצונך למחוק את הפלטפורמה?',
  },
}

// fallback יציב ל-props של מודאלים, כדי שלא ייווצר אובייקט חדש בכל רינדור
const EMPTY = Object.freeze({})

const FILE_TYPE_COLORS = {
  txt: 'bg-info-100 text-info-700',
  pdf: 'bg-danger-100 text-danger-700',
  docx: 'bg-success-100 text-success-700',
}

const NO_RECORD = '__none__'

// קטגוריה שמוצגת תמיד בתחתית העמוד
const NOT_ADAPTED_CATEGORY = 'לא מותאם עדיין לאוצריא'

export default function PrivateSourcesPage() {
  const { showAlert, showMessage, showConfirm } = useDialog()

  const [items, setItems] = useState([])
  const [orphans, setOrphans] = useState([])
  const [options, setOptions] = useState({ statuses: {}, methods: {}, platforms: {} })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [githubWarning, setGithubWarning] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const [editingItem, setEditingItem] = useState(null)
  const [configModal, setConfigModal] = useState(null)

  const load = useCallback(async ({ refresh = false } = {}) => {
    try {
      if (refresh) setRefreshing(true)
      else setLoading(true)
      setError('')
      setGithubWarning('')

      const response = await fetch(`/api/admin/private-sources${refresh ? '?refresh=1' : ''}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בטעינה')

      setItems(data.items || [])
      setOrphans(data.orphans || [])
      setOptions(data.options || { statuses: {}, methods: {}, platforms: {} })
      if (data.githubError) {
        setGithubWarning(
          data.githubErrorMessage ||
            'לא ניתן לטעון את רשימת הספרים מגיטהאב כרגע — מוצגות רק רשומות שמורות'
        )
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ===== סינון =====

  const matches = useCallback(
    (item) => {
      if (onlyMissing && item.record) return false

      if (statusFilter) {
        if (statusFilter === NO_RECORD) {
          if (item.record) return false
        } else if ((item.record?.status || '') !== statusFilter) {
          return false
        }
      }

      const term = search.trim().toLowerCase()
      if (!term) return true
      return (
        item.bookTitle.toLowerCase().includes(term) ||
        item.bookPath.toLowerCase().includes(term) ||
        (item.record?.ownerName || '').toLowerCase().includes(term) ||
        (item.record?.obtainedBy || '').toLowerCase().includes(term)
      )
    },
    [onlyMissing, statusFilter, search]
  )

  // קיבוץ לפי קטגוריה עליונה; "לא מותאם עדיין לאוצריא" תמיד בתחתית
  const groups = useMemo(() => {
    const byCategory = new Map()
    for (const item of items.filter(matches)) {
      const list = byCategory.get(item.category) || []
      list.push(item)
      byCategory.set(item.category, list)
    }

    return Array.from(byCategory.entries())
      .map(([category, rows]) => ({ category, rows, count: rows.length }))
      .sort((a, b) => {
        const aLast = a.category === NOT_ADAPTED_CATEGORY
        const bLast = b.category === NOT_ADAPTED_CATEGORY
        if (aLast !== bLast) return aLast ? 1 : -1
        return a.category.localeCompare(b.category, 'he')
      })
  }, [items, matches])

  const visibleCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.count, 0),
    [groups]
  )

  const stats = useMemo(() => {
    const withRecord = items.filter((i) => i.record).length
    const byStatus = {}
    for (const item of items) {
      if (!item.record) continue
      const key = item.record.status || ''
      byStatus[key] = (byStatus[key] || 0) + 1
    }
    return { total: items.length, withRecord, missing: items.length - withRecord, byStatus }
  }, [items])

  // ===== פעולות =====

  const handleSave = async (payload) => {
    try {
      const response = await fetch('/api/admin/private-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשמירה')

      setItems((prev) =>
        prev.map((item) =>
          item.bookPath === payload.bookPath ? { ...item, record: data.record } : item
        )
      )
      setEditingItem(null)
      showAlert('נשמר', 'פרטי המקור נשמרו בהצלחה')
    } catch (saveError) {
      showMessage('שגיאה', saveError.message)
    }
  }

  const handleDelete = (item) => {
    showConfirm(
      'מחיקת רשומה',
      `למחוק את פרטי המקור של "${item.bookTitle}"? הספר עצמו בגיטהאב לא יושפע.`,
      async () => {
        try {
          const response = await fetch(
            `/api/admin/private-sources?path=${encodeURIComponent(item.bookPath)}`,
            { method: 'DELETE' }
          )
          const data = await response.json()
          if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה במחיקה')

          setItems((prev) =>
            prev.map((row) => (row.bookPath === item.bookPath ? { ...row, record: null } : row))
          )
          setOrphans((prev) => prev.filter((row) => row.bookPath !== item.bookPath))
          setEditingItem(null)
          showAlert('נמחק', 'הרשומה נמחקה')
        } catch (deleteError) {
          showMessage('שגיאה', deleteError.message)
        }
      },
      'מחק',
      'ביטול'
    )
  }

  const handleSaveConfig = async (modalKey, value) => {
    try {
      const response = await fetch('/api/admin/private-sources/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: CONFIG_MODALS[modalKey].configKey, value }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשמירת ההגדרות')

      setOptions((prev) => ({ ...prev, [modalKey]: data.value }))
      setConfigModal(null)
      showAlert('נשמר', 'ההגדרות עודכנו')
    } catch (configError) {
      showMessage('שגיאה', configError.message)
    }
  }

  const toggleGroup = (category) =>
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))

  // ===== תצוגה =====

  if (loading) {
    return (
      <div className="glass-strong p-6 rounded-xl">
        <LoadingSpinner message="טוען את רשימת הספרים הפרטיים מגיטהאב..." />
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className="glass-strong p-6 rounded-xl text-center">
        <p className="text-danger-700 mb-4">{error}</p>
        <button
          onClick={() => load()}
          className="px-5 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90"
        >
          נסה שוב
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="glass-strong p-6 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">copyright</span>
              מקורות ספרים פרטיים (מור בוקס)
            </h2>
            <p className="text-on-surface/60 text-sm mt-1">
              מי מסר כל ספר בתיקיית MoreBooks, ובאילו תנאים ניתן האישור לפרסום.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => load({ refresh: true })}
              disabled={refreshing}
              className="px-4 py-2 glass rounded-lg text-on-surface hover:bg-surface-variant flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined">refresh</span>
              {refreshing ? 'מרענן...' : 'רענון מגיטהאב'}
            </button>
            {Object.entries(CONFIG_MODALS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setConfigModal(key)}
                className="px-4 py-2 glass rounded-lg text-on-surface hover:bg-surface-variant flex items-center gap-2"
              >
                <span className="material-symbols-outlined">settings</span>
                {config.buttonLabel}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        {githubWarning && (
          <div className="mt-4 text-sm text-warning-700 bg-warning-50 border border-warning-200 px-3 py-2 rounded flex items-center gap-2">
            <span className="material-symbols-outlined text-base">warning</span>
            {githubWarning}
          </div>
        )}

        {/* סיכום */}
        <div className="flex flex-wrap gap-2 mt-5">
          <Chip label="סה״כ ספרים" value={stats.total} />
          <Chip label="עם רשומה" value={stats.withRecord} />
          <Chip label="ללא רשומה" value={stats.missing} tone="bg-danger-100 text-danger-700" />
          {Object.entries(options.statuses || {}).map(([key, config]) => (
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
              placeholder="חיפוש לפי שם ספר, נתיב, מוסר או משיג האישור"
              className="w-full pr-10 pl-3 py-2 rounded-lg border border-surface-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-surface-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">כל הסטטוסים</option>
            <option value={NO_RECORD}>ללא רשומה</option>
            {Object.entries(options.statuses || {}).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-on-surface px-3">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              className="w-4 h-4"
            />
            ללא רשומה בלבד
          </label>
        </div>

        <p className="text-sm text-on-surface/60 mt-3">מוצגים {visibleCount} מתוך {stats.total} ספרים</p>
      </div>

      {orphans.length > 0 && (
        <div className="glass p-4 rounded-xl text-sm text-on-surface/80">
          <p>
            <span className="font-bold">שים לב:</span> קיימות {orphans.length} רשומות לספרים שאינם
            נמצאים כרגע בגיטהאב.
          </p>
          <div className="mt-3 divide-y divide-surface-variant/50">
            {orphans.map((orphan) => (
              <div
                key={orphan.bookPath}
                className="flex items-center gap-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-on-surface truncate">{orphan.bookTitle}</div>
                  <div className="text-xs text-on-surface/50 truncate">{orphan.bookPath}</div>
                </div>
                <button
                  onClick={() => handleDelete(orphan)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-danger-700 hover:bg-danger-50 text-sm flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  מחיקת הרשומה
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="glass-strong p-10 rounded-xl text-center text-on-surface/60">
          לא נמצאו ספרים התואמים לסינון.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.category]
            return (
              <div key={group.category} className="glass-strong rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.category)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-variant/40 transition-colors"
                >
                  <span className="flex items-center gap-2 font-bold text-on-surface">
                    <span className="material-symbols-outlined text-primary">menu_book</span>
                    {group.category}
                    <span className="text-sm font-normal text-on-surface/60">({group.count})</span>
                  </span>
                  <span className="material-symbols-outlined text-on-surface/60">
                    {isCollapsed ? 'expand_more' : 'expand_less'}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-surface-variant/60 divide-y divide-surface-variant/50">
                    {group.rows.map((item) => (
                      <BookRow
                        key={item.bookPath}
                        item={item}
                        options={options}
                        onEdit={() => setEditingItem(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingItem && (
        <SourceEditModal
          item={editingItem}
          options={options}
          onSave={handleSave}
          onDelete={() => handleDelete(editingItem)}
          onClose={() => setEditingItem(null)}
        />
      )}

      {configModal && (
        <StatusConfigModal
          statuses={options[configModal] || EMPTY}
          uploads={
            configModal === 'statuses'
              ? items.filter((i) => i.record).map((i) => ({ bookStatus: i.record.status }))
              : configModal === 'methods'
                ? items
                    .filter((i) => i.record?.permissionMethod)
                    .map((i) => ({ bookStatus: i.record.permissionMethod }))
                : items.flatMap((i) =>
                    (i.record?.allowedPlatforms || []).map((p) => ({ bookStatus: p }))
                  )
          }
          usageNoun="ספרים"
          defaultKey=""
          title={CONFIG_MODALS[configModal].title}
          itemNoun={CONFIG_MODALS[configModal].itemNoun}
          itemNounPlural={CONFIG_MODALS[configModal].itemNounPlural}
          existingTitle={CONFIG_MODALS[configModal].existingTitle}
          addTitle={CONFIG_MODALS[configModal].addTitle}
          assignedText={CONFIG_MODALS[configModal].assignedText}
          deleteConfirmBody={CONFIG_MODALS[configModal].deleteConfirmBody}
          deleteConfirmQuestion={CONFIG_MODALS[configModal].deleteConfirmQuestion}
          onSave={(value) => handleSaveConfig(configModal, value)}
          onClose={() => setConfigModal(null)}
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

function BookRow({ item, options, onEdit }) {
  const record = item.record
  const methodLabel = record?.permissionMethod
    ? options.methods?.[record.permissionMethod]?.label || record.permissionMethod
    : ''

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-3 hover:bg-surface-variant/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-on-surface truncate">{item.bookTitle}</span>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
              FILE_TYPE_COLORS[item.fileType] || 'bg-neutral-200 text-neutral-700'
            }`}
          >
            {item.fileType}
          </span>
          {record?.requireCredit && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-warning-100 text-warning-700">
              קרדיט חובה
            </span>
          )}
        </div>
        <p className="text-xs text-on-surface/50 truncate mt-0.5">{item.bookPath}</p>
      </div>

      <div className="md:w-40 shrink-0">
        {record ? (
          <StatusBadge status={record.status} statuses={options.statuses || {}} />
        ) : (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-neutral-200 text-neutral-600">
            ללא רשומה
          </span>
        )}
      </div>

      <div className="md:w-44 shrink-0 text-sm text-on-surface/80 truncate">
        {record?.ownerName || '—'}
      </div>

      <div className="md:w-28 shrink-0 text-sm text-on-surface/60 truncate">
        {methodLabel || '—'}
      </div>

      <button
        onClick={onEdit}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 flex items-center gap-1"
      >
        <span className="material-symbols-outlined text-sm">edit</span>
        עריכה
      </button>
    </div>
  )
}
