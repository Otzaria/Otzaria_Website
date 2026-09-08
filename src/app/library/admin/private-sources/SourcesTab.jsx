'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import SourceEditModal from './SourceEditModal'
import ManualSetsModal from './ManualSetsModal'
import Chip from './Chip'
import { BookRow, SetRow } from './SourceRows'
import { NO_RECORD, matchesSourceItem, groupSourceItemsByCategory, computeSourceStats } from './sourcesFilters'
// קובץ טהור (ללא mongoose) ולכן ניתן לייבוא גם מרכיב לקוח
import { MANUAL_SETS_CONFIG_KEY } from '@/lib/private-sources-sets'

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

/**
 * כרטיסיית "מקורות ספרים": רשומות המקור של הספרים הפרטיים (מי מסר, באילו
 * תנאים ניתן האישור), כולל קיבוץ לסטים וניהול הרשימות הדינמיות (סטטוסים/
 * אופני אישור/פלטפורמות).
 */
export default function SourcesTab() {
  const { showAlert, showMessage, showConfirm } = useDialog()

  const [items, setItems] = useState([])
  const [orphans, setOrphans] = useState([])
  const [manualSets, setManualSets] = useState({})
  const [allBooks, setAllBooks] = useState([])
  const [options, setOptions] = useState({ statuses: {}, methods: {}, platforms: {} })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [githubWarning, setGithubWarning] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const [expandedSets, setExpandedSets] = useState({})

  const [editingItem, setEditingItem] = useState(null)
  const [configModal, setConfigModal] = useState(null)
  const [setsModalOpen, setSetsModalOpen] = useState(false)

  // quiet — טעינה מחדש בלי להחליף את העמוד בספינר (למשל אחרי שמירת סטים)
  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    try {
      if (refresh || quiet) setRefreshing(true)
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
      setManualSets(data.manualSets || {})
      setAllBooks(data.books || [])
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

  const groups = useMemo(() => {
    const filtered = items.filter((item) => matchesSourceItem(item, { search, statusFilter, onlyMissing }))
    return groupSourceItemsByCategory(filtered)
  }, [items, search, statusFilter, onlyMissing])

  const visibleCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.count, 0),
    [groups]
  )

  const stats = useMemo(() => computeSourceStats(items), [items])

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

      // רשומה של חבר בתוך סט אינה פריט עליון — צריך טעינה מחדש (שקטה) כדי לרענן אותה
      const isTopLevel = items.some((item) => item.bookPath === payload.bookPath)
      if (isTopLevel) {
        setItems((prev) =>
          prev.map((item) =>
            item.bookPath === payload.bookPath ? { ...item, record: data.record } : item
          )
        )
      } else {
        await load({ quiet: true })
      }
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

          // כמו בשמירה: רשומת חבר בסט אינה פריט עליון ודורשת טעינה שקטה
          const isTopLevel = items.some((row) => row.bookPath === item.bookPath)
          if (isTopLevel) {
            setItems((prev) =>
              prev.map((row) => (row.bookPath === item.bookPath ? { ...row, record: null } : row))
            )
          }
          setOrphans((prev) => prev.filter((row) => row.bookPath !== item.bookPath))
          setEditingItem(null)
          if (!isTopLevel) await load({ quiet: true })
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

  const handleSaveManualSets = async (value) => {
    try {
      const response = await fetch('/api/admin/private-sources/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: MANUAL_SETS_CONFIG_KEY, value }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשמירת הסטים')

      setSetsModalOpen(false)
      // הקיבוץ מחושב בשרת — לכן טעינה מחדש (ללא רענון מטמון הגיטהאב),
      // שקטה כדי שהעמוד לא יתרוקן לספינר
      await load({ quiet: true })
      showAlert('נשמר', 'הסטים הידניים עודכנו')
    } catch (setsError) {
      showMessage('שגיאה', setsError.message)
    }
  }

  const toggleGroup = (category) =>
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))

  const toggleSet = (bookPath) =>
    setExpandedSets((prev) => ({ ...prev, [bookPath]: !prev[bookPath] }))

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
            <button
              onClick={() => setSetsModalOpen(true)}
              className="px-4 py-2 glass rounded-lg text-on-surface hover:bg-surface-variant flex items-center gap-2"
            >
              <span className="material-symbols-outlined">library_books</span>
              ניהול סטים
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
          <Chip label="סה״כ פריטים" value={stats.total} />
          <Chip label="סטים" value={stats.sets} tone="bg-info-100 text-info-700" />
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
              placeholder="חיפוש לפי שם ספר או סט, נתיב, מוסר או משיג האישור"
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

        <p className="text-sm text-on-surface/60 mt-3">
          מוצגים {visibleCount} מתוך {stats.total} פריטים (ספר בודד או סט)
        </p>
      </div>

      {/* בכשל גיטהאב כל רשומה נראית "נטושה" — ולכן הרצועה מוסתרת כדי לא להטעות */}
      {!githubWarning && orphans.length > 0 && (
        <div className="glass p-4 rounded-xl text-sm text-on-surface/80">
          <p>
            <span className="font-bold">שים לב:</span> קיימות {orphans.length} רשומות לספרים שאינם
            נמצאים כרגע בגיטהאב.
          </p>
          <div className="mt-3 divide-y divide-surface-variant/50">
            {orphans.map((orphan) => (
              <div key={orphan.bookPath} className="flex items-center gap-3 py-2">
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
                    {group.rows.map((item) =>
                      item.kind === 'set' ? (
                        <SetRow
                          key={item.bookPath}
                          item={item}
                          options={options}
                          expanded={Boolean(expandedSets[item.bookPath])}
                          onToggle={() => toggleSet(item.bookPath)}
                          onEdit={() => setEditingItem(item)}
                          onEditMember={(member) => setEditingItem({ ...member, kind: 'book' })}
                        />
                      ) : (
                        <BookRow
                          key={item.bookPath}
                          item={item}
                          options={options}
                          onEdit={() => setEditingItem(item)}
                        />
                      )
                    )}
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

      {setsModalOpen && (
        <ManualSetsModal
          manualSets={manualSets}
          books={allBooks}
          onSave={handleSaveManualSets}
          onClose={() => setSetsModalOpen(false)}
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
