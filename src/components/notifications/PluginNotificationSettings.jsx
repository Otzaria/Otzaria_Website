'use client'

import { useEffect, useState } from 'react'
import { apiGet, apiPut } from '@/lib/api-utils'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Loader from '@/components/ui/Loader'
import CheckboxField from '@/components/plugins/form/CheckboxField'

/**
 * "הגדרות התראות" (מתפריט ⋮ במסך התוספים): מייל למנהל כשמפתח מגיש תוסף. ui/Dialog — פוקוס, Esc, ובטלפון
 * גיליון תחתון. אותן בקשות כמו קודם (GET / PUT /api/admin/plugin-notifications). נסגר רק אחרי שמירה מוצלחת.
 */
export default function PluginNotificationSettings({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    apiGet('/api/admin/plugin-notifications')
      .then((data) => { if (!cancelled && data.success) setEnabled(data.enabled) })
      .catch(() => { if (!cancelled) setError('לא הצלחנו לטעון את ההגדרה.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await apiPut('/api/admin/plugin-notifications', { enabled })
      if (data.success) onClose()
      else setError('לא הצלחנו לשמור. נסה שוב.')
    } catch {
      setError('לא הצלחנו לשמור. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title="הגדרות התראות"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={saving}>ביטול</Button>
          <Button variant="filled" size="sm" onClick={save} loading={saving} disabled={loading}>{saving ? 'שומר…' : 'שמור'}</Button>
        </>
      )}
    >
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <Loader size="inline" decorative />
          טוען…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <CheckboxField
            id="plugin-notifications-enabled"
            checked={enabled}
            onChange={setEnabled}
            label="מייל כשמפתח מגיש תוסף"
            description="תקבל מייל על כל תוסף חדש או עדכון שמחכה לאישור, עם הפרטים וקישור ל״לאישור״."
          />
          {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}
