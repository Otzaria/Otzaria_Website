'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PluginNotificationSettings from '@/components/notifications/PluginNotificationSettings'
import PluginEditModal from '@/components/plugins/PluginEditModal'
import PluginApproveModal from '@/components/plugins/PluginApproveModal'
import StoreLayoutTab from './StoreLayoutTab'
import { formatPluginStatus } from '@/lib/pluginSubmission'

export default function AdminPluginsPage() {
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'approved' | 'store'
  const [pendingPlugins, setPendingPlugins] = useState([])
  const [approvedPlugins, setApprovedPlugins] = useState([])
  const [categories, setCategories] = useState([]) // קטגוריות החנות — להצגת שיבוצים בכרטיסי המאושרים
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [deletingVersion, setDeletingVersion] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingPlugin, setEditingPlugin] = useState(null)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [approvingPlugin, setApprovingPlugin] = useState(null) // תוסף חדש בזרימת אישור (מודאל קטגוריות)
  const [assigningPlugin, setAssigningPlugin] = useState(null) // תוסף מאושר שנפתח לו מודאל "ערוך שיבוץ"
  const [assignProcessingId, setAssignProcessingId] = useState(null)
  const { showConfirm, showAlert } = useDialog()

  const loadPendingPlugins = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/plugins?status=pending')

      if (!response.ok) {
        throw new Error('Failed to load plugins')
      }

      const data = await response.json()
      setPendingPlugins(data)
    } catch (error) {
      console.error('Error loading pending plugins:', error)
      showAlert('שגיאה בטעינת תוספים', 'לא הצלחנו לטעון את רשימת התוספים הממתינים')
    } finally {
      setLoading(false)
    }
  }

  const loadApprovedPlugins = async () => {
    try {
      setLoading(true)
      const [response, categoriesResponse] = await Promise.all([
        fetch('/api/admin/plugins?status=approved'),
        fetch('/api/admin/plugin-categories')
      ])

      if (!response.ok) {
        throw new Error('Failed to load plugins')
      }

      const data = await response.json()
      setApprovedPlugins(data)

      // כשל בטעינת הקטגוריות לא חוסם את רשימת התוספים — רק שורת השיבוצים לא תוצג
      if (categoriesResponse.ok) {
        setCategories(await categoriesResponse.json())
      }
    } catch (error) {
      console.error('Error loading approved plugins:', error)
      showAlert('שגיאה בטעינת תוספים', 'לא הצלחנו לטעון את רשימת התוספים המאושרים')
    } finally {
      setLoading(false)
    }
  }

  const refreshCategories = async () => {
    try {
      const response = await fetch('/api/admin/plugin-categories')
      if (response.ok) {
        setCategories(await response.json())
      }
    } catch (error) {
      console.error('Error refreshing categories:', error)
    }
  }

  const loadPlugins = () => {
    if (activeTab === 'pending') {
      loadPendingPlugins()
    } else if (activeTab === 'approved') {
      loadApprovedPlugins()
    } else {
      // לשונית "סידור החנות" טוענת את נתוניה בעצמה (StoreLayoutTab)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPlugins()
  // רענון לפי לשונית; loadPlugins מוחרג
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleApprove = async (plugin) => {
    // תוסף חדש — מודאל אישור עם שיבוץ לקטגוריות; אישור עדכון — confirm רגיל (בלי UI קטגוריות)
    if (!plugin.pendingUpdate) {
      setApprovingPlugin(plugin)
      return
    }

    const confirmed = await showConfirm(
      'אישור תוסף',
      `האם אתה בטוח שברצונך לאשר את התוסף "${plugin.name}"? לאחר האישור, התוסף יהיה זמין לכל המשתמשים.`
    )

    if (!confirmed) return
    await performApprove(plugin)
  }

  // ביצוע האישור בפועל; לתוסף חדש נתמכים גם שיבוץ לקטגוריות והוספה לנבחרים בדף הבית.
  // ההוספה לנבחרים מתבצעת בצד השרת ($addToSet) יחד עם האישור — אטומית מול עריכות מקבילות.
  const performApprove = async (plugin, { categoryIds = [], addToFeatured = false } = {}) => {
    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          ...(categoryIds.length > 0 ? { categoryIds } : {}),
          ...(addToFeatured ? { addToFeatured: true } : {})
        })
      })

      if (!response.ok) {
        throw new Error('Failed to approve plugin')
      }

      setApprovingPlugin(null)
      await showAlert('תוסף אושר', `התוסף "${plugin.name}" אושר בהצלחה!`)
      loadPlugins()
    } catch (error) {
      console.error('Error approving plugin:', error)
      showAlert('שגיאה', 'לא הצלחנו לאשר את התוסף')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (plugin) => {
    const confirmed = await showConfirm(
      'דחיית תוסף',
      `האם אתה בטוח שברצונך לדחות ולמחוק את התוסף "${plugin.name}"? פעולה זו תמחק את התוסף וכל הקבצים הקשורים אליו ולא ניתן לבטלה.`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to reject plugin')
      }

      const result = await response.json()
      await showAlert('תוסף נדחה', result.message || `התוסף "${plugin.name}" נדחה בהצלחה`)
      loadPlugins()
    } catch (error) {
      console.error('Error rejecting plugin:', error)
      showAlert('שגיאה', 'לא הצלחנו לדחות את התוסף')
    } finally {
      setProcessingId(null)
    }
  }

  const handleUnapprove = async (plugin) => {
    const confirmed = await showConfirm(
      'ביטול אישור תוסף',
      `האם אתה בטוח שברצונך לבטל את האישור של התוסף "${plugin.name}"? התוסף יועבר חזרה לרשימת הממתינים ולא יהיה זמין למשתמשים.`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unapprove' })
      })

      if (!response.ok) {
        throw new Error('Failed to unapprove plugin')
      }

      await showAlert('אישור בוטל', `האישור של התוסף "${plugin.name}" בוטל בהצלחה`)
      loadPlugins()
    } catch (error) {
      console.error('Error unapproving plugin:', error)
      showAlert('שגיאה', 'לא הצלחנו לבטל את האישור')
    } finally {
      setProcessingId(null)
    }
  }

  // השהיית תוסף מהחנות / החזרתו. השהיית מנהל גוברת על השהיית המעלה —
  // תוסף שהושהה בניהול יוכל לחזור לחנות רק מכאן.
  const handleToggleSuspend = async (plugin) => {
    const suspend = plugin.isSuspended !== true
    const confirmed = await showConfirm(
      suspend ? 'השהיית תוסף' : 'החזרת תוסף לחנות',
      suspend
        ? `להשהות את התוסף "${plugin.name}"? התוסף לא יופיע בחנות ולא יהיה ניתן להורדה — למעט למעלה ולמנהלי התוספים בקישור ישיר. האישור עצמו נשמר וניתן להחזירו לחנות בכל עת.`
        : `להחזיר את התוסף "${plugin.name}" לחנות? הוא יופיע שוב בחנות ויהיה זמין להורדה.`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspend ? 'suspend' : 'resume' })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update suspension')
      }

      await showAlert(suspend ? 'התוסף הושהה' : 'התוסף חזר לחנות', result.message)
      loadPlugins()
    } catch (error) {
      console.error('Error updating plugin suspension:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לעדכן את מצב ההשהיה')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (plugin) => {
    const confirmed = await showConfirm(
      'מחיקת תוסף',
      `האם אתה בטוח שברצונך למחוק את התוסף "${plugin.name}"? פעולה זו תמחק את התוסף לצמיתות ולא ניתן לבטלה.`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete plugin')
      }

      await showAlert('תוסף נמחק', `התוסף "${plugin.name}" נמחק בהצלחה`)
      loadPlugins()
    } catch (error) {
      console.error('Error deleting plugin:', error)
      showAlert('שגיאה', 'לא הצלחנו למחוק את התוסף')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeleteVersion = async (plugin, version) => {
    const confirmed = await showConfirm(
      'מחיקת גרסה',
      `האם למחוק לצמיתות את גרסה ${version} של "${plugin.name}"? פעולה זו תמחק את קובץ הגרסה הישנה ולא ניתן לבטלה.`
    )

    if (!confirmed) return

    try {
      setDeletingVersion(`${plugin._id}:${version}`)
      const response = await fetch(
        `/api/admin/plugins/${plugin._id}/versions/${encodeURIComponent(version)}`,
        { method: 'DELETE' }
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete version')
      }

      await showAlert('גרסה נמחקה', result.message || `גרסה ${version} נמחקה בהצלחה`)
      loadPlugins()
    } catch (error) {
      console.error('Error deleting plugin version:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו למחוק את הגרסה')
    } finally {
      setDeletingVersion(null)
    }
  }

  const handleEdit = async (plugin) => {
    try {
      setEditingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}/edit`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'לא ניתן לטעון את מסך העריכה')
      }

      setEditingPlugin({
        ...result,
        _id: result.id
      })
    } catch (error) {
      console.error('Error loading plugin edit modal:', error)
      showAlert('שגיאה', error.message || 'לא ניתן לטעון את מסך העריכה')
    } finally {
      setEditingId(null)
    }
  }

  // שינוי שיבוץ ממודאל "ערוך שיבוץ" — כל סימון/ביטול נשמר מיידית
  const handleToggleAssignment = async (plugin, category, checked) => {
    try {
      setAssignProcessingId(category.id)
      const response = await fetch(`/api/admin/plugin-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: checked ? 'addPlugin' : 'removePlugin',
          pluginId: plugin._id
        })
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update assignment')
      }

      // עדכון מקומי מהתשובה — הקטגוריה חוזרת מפורמטת וטרייה
      setCategories((prev) => prev.map((item) => (item.id === category.id ? result.category : item)))
    } catch (error) {
      console.error('Error toggling category assignment:', error)
      showAlert('שגיאה', error.message || 'לא הצלחנו לעדכן את השיבוץ')
    } finally {
      setAssignProcessingId(null)
    }
  }

  // הקטגוריות שבהן תוסף משובץ — לשורת המידע בכרטיס ולמודאל השיבוץ
  const getPluginCategories = (pluginId) =>
    categories.filter((category) => category.plugins.some((item) => item.id === pluginId))

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status) => {
    const badges = {
      stable: { label: formatPluginStatus('stable'), class: 'bg-success-100 text-success-800' },
      beta: { label: formatPluginStatus('beta'), class: 'bg-warning-alt-100 text-warning-alt-800' },
      experimental: { label: formatPluginStatus('experimental'), class: 'bg-warning-strong-100 text-warning-strong-800' }
    }
    const badge = badges[status] || badges.stable
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${badge.class}`}>
        {badge.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    )
  }

  const plugins = activeTab === 'pending' ? pendingPlugins : approvedPlugins
  const getReviewSource = (plugin) => plugin.pendingUpdate || plugin
  const hasPendingUpdate = (plugin) => Boolean(plugin.pendingUpdate)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-on-surface">ניהול תוספים</h1>
          <p className="text-on-surface/60 mt-1">
            {activeTab === 'store'
              ? 'סידור דף הבית של החנות: נבחרים, קטגוריות ושיבוצים'
              : activeTab === 'pending'
              ? plugins.length === 0
                ? 'אין תוספים ממתינים לאישור'
                : `${plugins.length} תוספים ממתינים לאישור`
              : plugins.length === 0
                ? 'אין תוספים מאושרים'
                : `${plugins.length} תוספים מאושרים`
            }
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNotificationSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-info-alt-600 hover:bg-info-alt-700 text-white rounded-lg transition-colors font-medium"
            title="הגדרות התראות על העלאת תוספים"
          >
            <span className="material-symbols-outlined">notifications</span>
            <span>התראות</span>
          </button>
          
          <button
            onClick={loadPlugins}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-variant rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">refresh</span>
            <span>רענן</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-variant">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-6 py-3 font-bold transition-colors relative ${
            activeTab === 'pending'
              ? 'text-primary'
              : 'text-on-surface/60 hover:text-on-surface'
          }`}
        >
          <span>ממתינים לאישור</span>
          {pendingPlugins.length > 0 && (
            <span className="absolute -top-1 -left-1 w-6 h-6 bg-primary text-white rounded-full text-xs flex items-center justify-center font-bold">
              {pendingPlugins.length}
            </span>
          )}
          {activeTab === 'pending' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('approved')}
          className={`px-6 py-3 font-bold transition-colors relative ${
            activeTab === 'approved'
              ? 'text-primary'
              : 'text-on-surface/60 hover:text-on-surface'
          }`}
        >
          <span>מאושרים</span>
          {approvedPlugins.length > 0 && (
            <span className="absolute -top-1 -left-1 w-6 h-6 bg-success-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
              {approvedPlugins.length}
            </span>
          )}
          {activeTab === 'approved' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          )}
        </button>

        <button
          onClick={() => setActiveTab('store')}
          className={`px-6 py-3 font-bold transition-colors relative ${
            activeTab === 'store'
              ? 'text-primary'
              : 'text-on-surface/60 hover:text-on-surface'
          }`}
        >
          <span>סידור החנות</span>
          {activeTab === 'store' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
          )}
        </button>
      </div>

      {/* לשונית סידור החנות — טוענת את נתוניה בעצמה */}
      {activeTab === 'store' ? (
        <StoreLayoutTab />
      ) : plugins.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface/30 mb-4 block">
            {activeTab === 'pending' ? 'check_circle' : 'extension'}
          </span>
          <h3 className="text-xl font-bold text-on-surface mb-2">
            {activeTab === 'pending' ? 'אין תוספים ממתינים' : 'אין תוספים מאושרים'}
          </h3>
          <p className="text-on-surface/60">
            {activeTab === 'pending' 
              ? 'כל התוספים שהועלו כבר אושרו או נדחו'
              : 'עדיין לא אושרו תוספים במערכת'
            }
          </p>
        </div>
      ) : (
        /* Plugins List */
        <div className="space-y-4">
          {plugins.map((plugin) => (
            <div
              key={plugin._id}
              className="glass rounded-2xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="grid md:grid-cols-[200px_1fr_auto] gap-6">
                {(() => {
                  const source = getReviewSource(plugin)
                  return (
                    <>
                {/* Plugin Image */}
                <div className="rounded-xl overflow-hidden bg-gradient-to-br from-primary/5 to-secondary/5 aspect-[4/3]">
                  {source.image?.ext ? (
                    <img
                      src={`/api/plugins/${plugin._id}/image${activeTab === 'pending' && hasPendingUpdate(plugin) ? '?pending=1' : ''}`}
                      alt={source.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-6xl text-on-surface/20">
                        extension
                      </span>
                    </div>
                  )}
                </div>

                {/* Plugin Info */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold text-on-surface">
                        {source.name}
                      </h3>
                      {activeTab === 'pending' && hasPendingUpdate(plugin) && (
                        <span className="rounded-full bg-info-100 px-3 py-1 text-xs font-bold text-info-800">עריכה ממתינה</span>
                      )}
                      {activeTab === 'pending' && !hasPendingUpdate(plugin) && (
                        <span className="rounded-full bg-feature-100 px-3 py-1 text-xs font-bold text-feature-800">תוסף חדש</span>
                      )}
                      {getStatusBadge(source.status)}
                      <span className="px-3 py-1 bg-surface rounded-full text-xs font-bold text-on-surface/60">
                        גרסה {source.version}
                      </span>
                      {plugin.isSuspended && (
                        <span className="rounded-full bg-warning-strong-100 px-3 py-1 text-xs font-bold text-warning-strong-800">
                          מושהה {plugin.suspendedByRole === 'admin' ? '(ע"י הניהול)' : '(ע"י המעלה)'}
                        </span>
                      )}
                    </div>
                    <p className="text-on-surface/70 leading-relaxed">
                      {source.shortDescription}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-on-surface/60">מפתח:</span>
                      <span className="font-medium text-on-surface mr-2">
                        {source.author}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface/60">הועלה על ידי:</span>
                      <span className="font-medium text-on-surface mr-2">
                        {plugin.authorId?.name || 'לא ידוע'}
                      </span>
                      {plugin.authorId?.email && (
                        <span className="text-on-surface/50 text-xs block">
                          {plugin.authorId.email}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-on-surface/60">תאימות:</span>
                      <span className="font-medium text-on-surface mr-2">
                        {source.compatibleWith}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface/60">{hasPendingUpdate(plugin) ? 'נשלח לעדכון:' : 'הועלה:'}</span>
                      <span className="font-medium text-on-surface mr-2">
                        {formatDate(plugin.lastSubmittedAt || plugin.createdAt)}
                      </span>
                    </div>
                    {plugin.lastSubmittedBy?.name && (
                      <div>
                        <span className="text-on-surface/60">נשלח ע"י:</span>
                        <span className="font-medium text-on-surface mr-2">
                          {plugin.lastSubmittedBy.name}
                        </span>
                      </div>
                    )}
                    {activeTab === 'approved' && plugin.approvedAt && (
                      <div>
                        <span className="text-on-surface/60">אושר:</span>
                        <span className="font-medium text-on-surface mr-2">
                          {formatDate(plugin.approvedAt)}
                        </span>
                      </div>
                    )}
                    {activeTab === 'approved' && plugin.approvedBy?.name && (
                      <div>
                        <span className="text-on-surface/60">אושר ע"י:</span>
                        <span className="font-medium text-on-surface mr-2">
                          {plugin.approvedBy.name}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-on-surface/60">קובץ:</span>
                      <span className="font-medium text-on-surface mr-2">
                        {source.pluginFileName || plugin.pluginFileName}
                      </span>
                    </div>
                    {activeTab === 'approved' && (
                      <div>
                        <span className="text-on-surface/60">הורדות:</span>
                        <span className="font-medium text-on-surface mr-2">
                          {plugin.downloadCount || 0}
                        </span>
                      </div>
                    )}
                    {activeTab === 'approved' && categories.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-on-surface/60">קטגוריות:</span>
                        <span className="font-medium text-on-surface mr-2">
                          {getPluginCategories(plugin._id).map((category) => category.name).join(', ') || 'ללא'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {source.tags && source.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {source.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-surface rounded-full text-xs text-on-surface/70"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  {source.description && source.description !== source.shortDescription && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-primary font-medium hover:underline">
                        תיאור מלא
                      </summary>
                      <p className="mt-2 text-on-surface/70 leading-relaxed whitespace-pre-wrap">
                        {source.description}
                      </p>
                    </details>
                  )}

                  {activeTab === 'pending' && plugin.pendingChangeSummary?.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-primary font-medium hover:underline">
                        הצג שינויים שהוגשו
                      </summary>
                      <div className="mt-3 space-y-3">
                        {plugin.pendingChangeSummary.map((change, index) => (
                          <div key={`${change.field}-${index}`} className="rounded-xl border border-neutral-200 bg-surface p-3">
                            <div className="font-bold text-on-surface mb-1">{change.label}</div>
                            <div className="text-on-surface/60">לפני: {change.before || 'ללא'}</div>
                            <div className="text-on-surface">אחרי: {change.after || 'ללא'}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Homepage Link */}
                  {source.homepage && (
                    <a
                      href={source.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <span className="material-symbols-outlined text-base">open_in_new</span>
                      <span>דף הבית</span>
                    </a>
                  )}

                  {/* Previous Versions */}
                  {plugin.versions?.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-primary hover:underline">
                        גרסאות קודמות ({plugin.versions.length})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {[...plugin.versions]
                          .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt))
                          .map((v) => (
                            <div
                              key={v.version}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-surface p-3"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-on-surface">גרסה {v.version}</span>
                                <span className="mr-2 text-xs text-on-surface/50">
                                  {formatDate(v.archivedAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={`/api/plugins/${plugin._id}@${encodeURIComponent(v.version)}/download`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-surface-variant px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-200"
                                >
                                  <span className="material-symbols-outlined text-base">download</span>
                                  <span>הורד</span>
                                </a>
                                <button
                                  onClick={() => handleDeleteVersion(plugin, v.version)}
                                  disabled={deletingVersion === `${plugin._id}:${v.version}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-danger-100 px-3 py-1.5 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    {deletingVersion === `${plugin._id}:${v.version}` ? 'progress_activity' : 'delete'}
                                  </span>
                                  <span>מחק</span>
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                </div>
                    </>
                  )
                })()}

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  {activeTab === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleApprove(plugin)}
                        disabled={processingId === plugin._id}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-success-600 hover:bg-success-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">check_circle</span>
                            <span>אשר</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleReject(plugin)}
                        disabled={processingId === plugin._id}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-danger-600 hover:bg-danger-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">cancel</span>
                            <span>דחה</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setAssigningPlugin(plugin)}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-info-alt-600 hover:bg-info-alt-700 text-white rounded-xl font-bold transition-colors"
                        title="שיבוץ התוסף בקטגוריות החנות"
                      >
                        <span className="material-symbols-outlined">category</span>
                        <span>ערוך שיבוץ</span>
                      </button>

                      <button
                        onClick={() => handleToggleSuspend(plugin)}
                        disabled={processingId === plugin._id}
                        className={`flex items-center justify-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          plugin.isSuspended
                            ? 'bg-success-600 hover:bg-success-700'
                            : 'bg-warning-alt-600 hover:bg-warning-alt-700'
                        }`}
                        title={
                          plugin.isSuspended
                            ? 'החזרת התוסף לחנות'
                            : 'השהיית התוסף — יוסר מהחנות בלי לבטל את האישור'
                        }
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">
                              {plugin.isSuspended ? 'play_circle' : 'pause_circle'}
                            </span>
                            <span>{plugin.isSuspended ? 'החזר לחנות' : 'השהה'}</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleUnapprove(plugin)}
                        disabled={processingId === plugin._id}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-warning-strong-600 hover:bg-warning-strong-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">remove_circle</span>
                            <span>בטל אישור</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(plugin)}
                        disabled={processingId === plugin._id}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-danger-600 hover:bg-danger-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">delete</span>
                            <span>מחק</span>
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {/* Download Plugin File for Review */}
                  <a
                    href={`/api/plugins/${plugin._id}/download${activeTab === 'pending' && hasPendingUpdate(plugin) ? '?pending=1' : ''}`}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-surface hover:bg-surface-variant rounded-xl font-medium transition-colors text-center"
                  >
                    <span className="material-symbols-outlined">download</span>
                    <span>הורד לבדיקה</span>
                  </a>

                  <button
                    onClick={() => handleEdit(plugin)}
                    disabled={editingId === plugin._id}
                    className="flex items-center justify-center gap-2 rounded-xl bg-neutral-warm-700 px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-warm-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">edit</span>
                    <span>{editingId === plugin._id ? 'טוען...' : 'ערוך'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* חלון הגדרות התראות */}
      {showNotificationSettings && (
        <PluginNotificationSettings
          onClose={() => setShowNotificationSettings(false)}
        />
      )}

      {editingPlugin && (
        <PluginEditModal
          plugin={editingPlugin}
          endpoint={`/api/admin/plugins/${editingPlugin._id}/edit`}
          onClose={() => setEditingPlugin(null)}
          onSuccess={async (result) => {
            setEditingPlugin(null)
            await showAlert('הצלחה', result?.message || 'השינויים נשמרו בהצלחה.')
            loadPlugins()
          }}
        />
      )}

      {/* מודאל אישור תוסף חדש — עם שיבוץ אופציונלי לקטגוריות */}
      {approvingPlugin && (
        <PluginApproveModal
          plugin={approvingPlugin}
          onClose={() => setApprovingPlugin(null)}
          onConfirm={(selection) => performApprove(approvingPlugin, selection)}
        />
      )}

      {/* מודאל "ערוך שיבוץ" לתוסף מאושר */}
      {assigningPlugin && (
        <AssignCategoriesModal
          plugin={assigningPlugin}
          categories={categories}
          assignedCategoryIds={getPluginCategories(assigningPlugin._id).map((category) => category.id)}
          processingCategoryId={assignProcessingId}
          onToggle={handleToggleAssignment}
          onClose={() => {
            setAssigningPlugin(null)
            // רענון הקטגוריות בסגירה — שורת "קטגוריות:" בכרטיסים תתעדכן
            refreshCategories()
          }}
        />
      )}
    </div>
  )
}

// מודאל שיבוץ מקומי לתוסף מאושר — כל סימון/ביטול נשמר מיידית (addPlugin/removePlugin)
function AssignCategoriesModal({ plugin, categories, assignedCategoryIds, processingCategoryId, onToggle, onClose }) {
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-bold text-on-surface">שיבוץ בקטגוריות: {plugin.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-on-surface/60">כל שינוי נשמר מיידית.</p>

          {categories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-on-surface/50">
              עדיין לא נוצרו קטגוריות — ניתן ליצור בלשונית &quot;סידור החנות&quot;
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => {
                const checked = assignedCategoryIds.includes(category.id)
                const processing = processingCategoryId === category.id
                return (
                  <label
                    key={category.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50 ${
                      category.isVisible ? '' : 'opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={processingCategoryId !== null}
                      onChange={(e) => onToggle(plugin, category, e.target.checked)}
                      className="h-5 w-5 rounded border-neutral-300 text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                    {category.icon && (
                      <span className="material-symbols-outlined text-base text-on-surface/50">{category.icon}</span>
                    )}
                    <span className="flex-1 font-medium text-on-surface">{category.name}</span>
                    {!category.isVisible && (
                      <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-on-surface/60">מוסתרת</span>
                    )}
                    {processing && (
                      <span className="material-symbols-outlined animate-spin text-base text-primary">progress_activity</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-neutral-200 px-6 py-3 font-bold text-on-surface transition-colors hover:bg-neutral-50"
          >
            סגור
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
