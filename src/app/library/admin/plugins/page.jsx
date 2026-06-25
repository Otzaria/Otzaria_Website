'use client'

import { useState, useEffect } from 'react'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PluginNotificationSettings from '@/components/notifications/PluginNotificationSettings'
import PluginEditModal from '@/components/plugins/PluginEditModal'
import { formatPluginStatus } from '@/lib/pluginSubmission'

export default function AdminPluginsPage() {
  const [activeTab, setActiveTab] = useState('pending') // 'pending' or 'approved'
  const [pendingPlugins, setPendingPlugins] = useState([])
  const [approvedPlugins, setApprovedPlugins] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [deletingVersion, setDeletingVersion] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingPlugin, setEditingPlugin] = useState(null)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
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
      const response = await fetch('/api/admin/plugins?status=approved')

      if (!response.ok) {
        throw new Error('Failed to load plugins')
      }

      const data = await response.json()
      setApprovedPlugins(data)
    } catch (error) {
      console.error('Error loading approved plugins:', error)
      showAlert('שגיאה בטעינת תוספים', 'לא הצלחנו לטעון את רשימת התוספים המאושרים')
    } finally {
      setLoading(false)
    }
  }

  const loadPlugins = () => {
    if (activeTab === 'pending') {
      loadPendingPlugins()
    } else {
      loadApprovedPlugins()
    }
  }

  useEffect(() => {
    loadPlugins()
  // רענון לפי לשונית; loadPlugins מוחרג
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleApprove = async (plugin) => {
    const confirmed = await showConfirm(
      'אישור תוסף',
      `האם אתה בטוח שברצונך לאשר את התוסף "${plugin.name}"? לאחר האישור, התוסף יהיה זמין לכל המשתמשים.`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' })
      })

      if (!response.ok) {
        throw new Error('Failed to approve plugin')
      }

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

  const handleTogglePin = async (plugin) => {
    const willPin = !plugin.isPinned
    const confirmed = await showConfirm(
      willPin ? 'הצמדת תוסף' : 'ביטול הצמדה',
      willPin
        ? `האם להצמיד את התוסף "${plugin.name}"? תוספים מוצמדים יוצגו תמיד בראש החנות.`
        : `האם לבטל את ההצמדה של התוסף "${plugin.name}"?`
    )

    if (!confirmed) return

    try {
      setProcessingId(plugin._id)
      const response = await fetch(`/api/admin/plugins/${plugin._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: willPin ? 'pin' : 'unpin' })
      })

      if (!response.ok) {
        throw new Error('Failed to toggle pin')
      }

      loadPlugins()
    } catch (error) {
      console.error('Error toggling pin:', error)
      showAlert('שגיאה', 'לא הצלחנו לעדכן את ההצמדה')
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
            {activeTab === 'pending' 
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
      </div>

      {/* Empty State */}
      {plugins.length === 0 ? (
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
                      {activeTab === 'approved' && plugin.isPinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-3 py-1 text-xs font-bold text-warning-800">
                          <span className="material-symbols-outlined text-sm">push_pin</span>
                          <span>מוצמד</span>
                        </span>
                      )}
                      {getStatusBadge(source.status)}
                      <span className="px-3 py-1 bg-surface rounded-full text-xs font-bold text-on-surface/60">
                        גרסה {source.version}
                      </span>
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
                        onClick={() => handleTogglePin(plugin)}
                        disabled={processingId === plugin._id}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          plugin.isPinned
                            ? 'bg-warning-100 text-warning-800 hover:bg-warning-200'
                            : 'bg-warning-600 hover:bg-warning-700 text-white'
                        }`}
                        title={plugin.isPinned ? 'בטל הצמדה' : 'הצמד תוסף — יופיע ראשון בחנות'}
                      >
                        {processingId === plugin._id ? (
                          <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>מעבד...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined">{plugin.isPinned ? 'keep_off' : 'push_pin'}</span>
                            <span>{plugin.isPinned ? 'בטל הצמדה' : 'הצמד'}</span>
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
    </div>
  )
}
