'use client'

import { useEffect, useState } from 'react'
import DetailSection from '@/components/plugins/detail/DetailSection'
import UserText from '@/components/plugins/detail/UserText'
import Ltr from '@/components/ui/Ltr'
import type { PublicServiceInfo } from './serviceDownloadLogic'

/**
 * הוראות הסרת השירות בעמוד התוסף — כפי שהמפתח כתב אותן בהגשה המאושרת. הסרת התוסף מאוצריא אינה
 * מסירה את השירות, ולכן ההוראות גלויות בעמוד ולא רק בחלון ההורדה.
 */
export default function ServiceUninstallSection({ pluginId }: { pluginId: string }) {
  const [current, setCurrent] = useState<PublicServiceInfo['current'] | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/service-plugins/${encodeURIComponent(pluginId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const info = (await response.json()) as PublicServiceInfo
        if (!cancelled) setCurrent(info.current ?? null)
      })
      .catch(() => {
        if (!cancelled) setCurrent(null)
      })
    return () => {
      cancelled = true
    }
  }, [pluginId])

  if (current === undefined) return null

  return (
    <DetailSection id="plugin-service-uninstall" title="הסרת השירות">
      <p className="mb-3 text-body-md text-on-surface-variant">
        הסרת התוסף מאוצריא אינה מסירה את השירות החיצוני. להסרת השירות
        {current?.serviceVersion ? <> (גרסה <Ltr>{current.serviceVersion}</Ltr>)</> : null}:
      </p>
      {current?.uninstall
        ? <UserText text={current.uninstall} className="max-w-measure text-body-md text-on-surface" />
        : <p className="text-body-md text-on-surface-variant">לא הצלחנו לטעון את הוראות ההסרה. נסו שוב מאוחר יותר.</p>}
    </DetailSection>
  )
}
