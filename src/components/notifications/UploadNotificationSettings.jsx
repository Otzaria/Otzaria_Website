'use client'

import { useState, useEffect } from 'react'
import { apiGet, apiPut } from '@/lib/api-utils'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Loader from '@/components/ui/Loader'
import Switch from '@/components/ui/Switch'
import { CHECKBOX } from '@/components/ui/fieldStyles'

/**
 * הגדרות ההתראות על העלאות (מתפריט ⋮ במסך ההעלאות): מייל כשמשתמש מעלה ספר שלם / עמוד.
 * הלוגיקה כמו קודם — טעינה מ-/api/admin/upload-notifications, שמירה ב-PUT וסגירה רק בהצלחה;
 * רק המעטפת עברה ל-ui/Dialog (גיליון תחתון בטלפון, לכידת פוקוס, Esc).
 */
export default function UploadNotificationSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    enabled: false,
    fullBook: false,
    singlePage: false
  })

  // טעינה פעם אחת בפתיחה (ההורה מרכיב את הרכיב בכל פתיחה); loading מתחיל ב-true
  useEffect(() => {
    let cancelled = false
    apiGet('/api/admin/upload-notifications')
      .then((data) => { if (!cancelled && data.success) setSettings(data.notifications) })
      .catch((error) => console.error('Error loading notification settings:', error))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      const data = await apiPut('/api/admin/upload-notifications', settings)
      if (data.success) {
        onClose()
      }
    } catch (error) {
      console.error('Error saving notification settings:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title="הגדרות התראות"
      subtitle="מייל אליך כשמשתמשים שולחים קבצים"
      onClose={onClose}
      footer={!loading && (
        <>
          <Button variant="text" size="sm" onClick={onClose}>ביטול</Button>
          <Button variant="filled" size="sm" onClick={handleSave} loading={saving}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        </>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader size="md" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-(--radius-control) bg-surface px-4 py-2">
            <Switch
              checked={settings.enabled}
              onChange={(enabled) => setSettings({ ...settings, enabled })}
              label="קבלת התראות במייל"
              description="מייל כשמשתמש שולח ספר או עמוד"
            />
          </div>

          {settings.enabled && (
            <fieldset className="flex flex-col gap-1 rounded-(--radius-control) bg-surface px-4 py-3">
              <legend className="sr-only">על אילו העלאות</legend>
              <p aria-hidden="true" className="mb-1 text-label-lg text-on-surface">על אילו העלאות</p>
              <label className="flex min-h-(--touch-target) cursor-pointer items-start gap-3 py-1.5">
                <input
                  type="checkbox"
                  checked={settings.fullBook}
                  onChange={(e) => setSettings({ ...settings, fullBook: e.target.checked })}
                  className={CHECKBOX}
                />
                <span>
                  <span className="block text-body-md text-on-surface">ספר שלם</span>
                  <span className="block text-body-sm text-on-surface-variant">משתמש העלה ספר מלא</span>
                </span>
              </label>
              <label className="flex min-h-(--touch-target) cursor-pointer items-start gap-3 py-1.5">
                <input
                  type="checkbox"
                  checked={settings.singlePage}
                  onChange={(e) => setSettings({ ...settings, singlePage: e.target.checked })}
                  className={CHECKBOX}
                />
                <span>
                  <span className="block text-body-md text-on-surface">עמוד אחרון בספר</span>
                  <span className="block text-body-sm text-on-surface-variant">משתמש סיים לערוך את העמוד האחרון בספר קיים</span>
                </span>
              </label>
            </fieldset>
          )}
        </div>
      )}
    </Dialog>
  )
}
