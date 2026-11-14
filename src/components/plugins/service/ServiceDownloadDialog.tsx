'use client'

import { useEffect, useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Loader from '@/components/ui/Loader'
import Ltr from '@/components/ui/Ltr'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import DirectInstallButton from '@/components/plugins/DirectInstallButton'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import { detectPlatform } from '@/lib/detectOs'
import ServiceDetectionStatus from './ServiceDetectionStatus'
import ServiceInstallerList from './ServiceInstallerList'
import ServiceOsPicker from './ServiceOsPicker'
import ServiceWarning from './ServiceWarning'
import {
  detectionPorts,
  initialOsChoice,
  offeredDownloads,
  platformsForOs,
  supportedOsList,
  type PublicServiceInfo
} from './serviceDownloadLogic'
import { isServiceOs, type ServiceOs } from './servicePlatforms'
import { formatRange } from './serviceVersion'
import { useLocalServiceDetection, type DetectionState } from './useLocalServiceDetection'

export interface ServiceDownloadPlugin {
  id: string
  name?: string
  downloadUrl: string
  supportsDirectInstall?: boolean
}

// unavailable — 404 (למשל תוספי השירות כבויים באתר): נשאר רק קובץ התוסף מ-plugin.downloadUrl
type LoadState = { phase: 'loading' } | { phase: 'error' } | { phase: 'unavailable' } | { phase: 'ready'; info: PublicServiceInfo }

function readVisitorPlatform(): string | null {
  if (typeof navigator === 'undefined') return null
  return detectPlatform({ userAgent: navigator.userAgent, platform: navigator.platform })
}

function PluginFileActions({ plugin, href, primary, canInstall, installState, onInstall }: {
  plugin: ServiceDownloadPlugin
  href: string
  primary: boolean
  canInstall: boolean
  installState: DirectInstallState
  onInstall: (downloadUrl: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button href={href} external variant={primary ? 'filled' : 'outlined'} size="sm" icon="download">
        הורדת התוסף
      </Button>
      {canInstall && (
        <DirectInstallButton
          pluginId={plugin.id}
          installState={installState}
          onInstall={() => onInstall(href)}
          showIcons
          idleLabel="התקנה באוצריא"
          className={cx(
            buttonClasses({ variant: 'outlined', size: 'sm' }),
            '[&_.material-symbols-outlined]:text-(length:--button-icon-size-sm)',
            'text-center disabled:cursor-default disabled:opacity-(--button-disabled-opacity)'
          )}
        />
      )}
    </div>
  )
}

/**
 * "אפשרויות הורדה" של תוסף שירות. הנתונים (GET /api/service-plugins/<id>) והזיהוי המקומי נטענים
 * רק כשהחלון נפתח — לא בטעינת הקטלוג. תואם → רק התוסף; לא תואם → המתקין; לא ידוע → שניהם.
 */
export default function ServiceDownloadDialog({ plugin, installState, onInstall, canInstall, onClose }: {
  plugin: ServiceDownloadPlugin
  installState: DirectInstallState
  onInstall: (downloadUrl: string) => void
  /** התקנה ישירה באוצריא זמינה לתוסף (canDirectInstall) */
  canInstall: boolean
  onClose: () => void
}) {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [visitorPlatform] = useState(readVisitorPlatform)
  const [chosenOs, setChosenOs] = useState<ServiceOs | null>(null)
  const installerHeadingId = useId()
  const pluginHeadingId = useId()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/service-plugins/${encodeURIComponent(plugin.id)}`)
      .then(async (response) => {
        if (response.status === 404) {
          if (!cancelled) setLoad({ phase: 'unavailable' })
          return
        }
        if (!response.ok) throw new Error(String(response.status))
        const info = (await response.json()) as PublicServiceInfo
        if (!cancelled) setLoad({ phase: 'ready', info })
      })
      .catch(() => {
        if (!cancelled) setLoad({ phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [plugin.id])

  const info = load.phase === 'ready' ? load.info : null
  const current = info?.current ?? null
  const platforms = current?.platforms ?? []
  const supported = supportedOsList(platforms)
  const initial = initialOsChoice(visitorPlatform, supported)
  const selectedOs = chosenOs ?? initial.selected
  const visitorServiceOs = isServiceOs(visitorPlatform) ? visitorPlatform : null

  const detection = useLocalServiceDetection({
    enabled: Boolean(current),
    ports: detectionPorts(platforms, visitorServiceOs),
    serviceId: info?.detection?.serviceId ?? info?.pluginUid ?? '',
    range: current?.serviceRange ?? null
  })
  const otherOs = Boolean(selectedOs && visitorPlatform && selectedOs !== visitorPlatform)
  // זיהוי במחשב הזה אינו רלוונטי להורדה למחשב אחר
  const effective: DetectionState = otherOs ? { status: 'unknown', version: null } : detection
  const offered = offeredDownloads(effective.status === 'idle' ? 'checking' : effective.status)
  const previousFiles = platformsForOs(info?.previous?.platforms ?? [], selectedOs)

  return (
    <Dialog title="אפשרויות הורדה" subtitle={info?.name ?? plugin.name} onClose={onClose} bodyClassName="flex flex-col gap-5">
      <ServiceWarning />

      {load.phase === 'loading' && <Loader size="md" label="טוען את אפשרויות ההורדה…" className="mx-auto" />}

      {load.phase === 'unavailable' && (
        <section aria-labelledby={pluginHeadingId} className="flex flex-col gap-3">
          <p role="status" className="text-body-md text-on-surface-variant">
            אפשרויות ההתקנה של השירות אינן זמינות זמנית. אפשר להוריד כעת רק את קובץ התוסף — הוא יפעל רק כשהשירות כבר מותקן במחשב.
          </p>
          <h3 id={pluginHeadingId} className="text-title-sm text-on-surface">התוסף בלבד</h3>
          <PluginFileActions plugin={plugin} href={plugin.downloadUrl} primary canInstall={canInstall} installState={installState} onInstall={onInstall} />
        </section>
      )}

      {(load.phase === 'error' || (info && !current)) && (
        <p role="alert" className="text-body-md text-error">
          לא הצלחנו לטעון את אפשרויות ההורדה של התוסף. נסו שוב מאוחר יותר.
        </p>
      )}

      {current && (
        <>
          <p className="text-body-sm text-on-surface-variant">
            גרסת השירות: <Ltr>{current.serviceVersion}</Ltr> · גרסת התוסף: <Ltr>{current.pluginVersion}</Ltr> ·
            {' '}התוסף עובד עם השירות בגרסה <Ltr>{formatRange(current.serviceRange)}</Ltr>
          </p>

          <ServiceDetectionStatus detection={detection} range={current.serviceRange} otherOs={otherOs} />

          {offered.installer && (
            <section aria-labelledby={installerHeadingId} className="flex flex-col gap-3">
              <h3 id={installerHeadingId} className="text-title-sm text-on-surface">התקנת השירות (כולל התוסף)</h3>
              <ServiceOsPicker
                supported={supported}
                selected={selectedOs}
                onSelect={setChosenOs}
                visitorOs={visitorPlatform}
                visitorSupported={initial.visitorSupported}
              />
              {selectedOs
                ? <ServiceInstallerList files={platformsForOs(platforms, selectedOs)} />
                : <p className="text-body-sm text-on-surface-variant">בחרו מערכת הפעלה כדי לראות את המתקינים.</p>}

              {info?.previous && selectedOs && (
                <details className="rounded-(--radius-control) border border-outline-variant p-3 text-body-sm">
                  <summary className="cursor-pointer text-label-lg text-on-surface">
                    גרסה קודמת (שירות <Ltr>{info.previous.serviceVersion}</Ltr>)
                  </summary>
                  <p className="mt-2 text-on-surface-variant">
                    מיועדת רק למקרה של תקלה בגרסה הנוכחית. הגרסה הקודמת כוללת את התוסף שהתאים לה.
                  </p>
                  <div className="mt-3">
                    <ServiceInstallerList files={previousFiles} emphasis="secondary" />
                  </div>
                </details>
              )}
            </section>
          )}

          {offered.plugin && (
            <section aria-labelledby={pluginHeadingId} className="flex flex-col gap-3">
              <h3 id={pluginHeadingId} className="text-title-sm text-on-surface">התוסף בלבד</h3>
              <p className="text-body-sm text-on-surface-variant">
                מתאים כשהשירות כבר מותקן במחשב בגרסה <Ltr>{formatRange(current.serviceRange)}</Ltr>.
              </p>
              <PluginFileActions
                plugin={plugin}
                href={current.pluginDownloadUrl || plugin.downloadUrl}
                primary={effective.status === 'compatible'}
                canInstall={canInstall}
                installState={installState}
                onInstall={onInstall}
              />
            </section>
          )}
        </>
      )}
    </Dialog>
  )
}
