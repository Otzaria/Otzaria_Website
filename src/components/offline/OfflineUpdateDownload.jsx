'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api-utils'

const PLATFORMS = [
  {
    key: 'windows',
    icon: 'desktop_windows',
    title: 'Windows',
    subtitle: 'קובץ התקנה (exe)',
    note: 'Windows 10 / 11'
  },
  {
    key: 'macos',
    icon: 'laptop_mac',
    title: 'macOS',
    subtitle: 'חבילת אפליקציה (zip)',
    note: 'macOS 10.15 ומעלה'
  }
]

function formatSize(bytes) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

/**
 * כרטיסי ההורדה של "עדכוני אוצריא" — הקישורים נטענים מ-/api/offline-update-releases
 * (ה-release האחרון בריפו Otzaria_Offline_update). כשה-API נכשל נשאר קישור לדף ה-releases.
 */
export default function OfflineUpdateDownload({ repoUrl }) {
  const [releases, setReleases] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setReleases(await apiGet('/api/offline-update-releases'))
      } catch {
        setFailed(true)
      }
    }
    load()
  }, [])

  const releasesPage = `${repoUrl}/releases/latest`

  return (
    <div className="glass-strong rounded-2xl p-8 border border-surface-variant shadow-xl">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold font-frank mb-2">הורדת הכלי</h2>
        <p className="text-on-surface/70">
          {releases?.version
            ? `הגרסה האחרונה: ${releases.version}`
            : failed
              ? 'לא הצלחנו לטעון את פרטי הגרסה. ניתן להוריד ישירות מדף ההפצות.'
              : 'טוען את פרטי הגרסה האחרונה...'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {PLATFORMS.map((platform) => {
          const asset = releases?.[platform.key]
          const href = asset?.url || releasesPage
          const size = formatSize(asset?.size)

          return (
            <a
              key={platform.key}
              href={href}
              className="flex items-center gap-5 p-6 bg-white border-2 border-primary rounded-2xl hover:shadow-2xl transition-all group"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-4xl text-primary group-hover:scale-110 transition-transform">
                  {platform.icon}
                </span>
              </div>
              <div className="flex-1 text-right">
                <h3 className="text-xl font-bold">{platform.title}</h3>
                <p className="text-sm text-neutral-600">{platform.subtitle}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {platform.note}
                  {size ? ` · ${size}` : ''}
                </p>
              </div>
              <span className="material-symbols-outlined text-3xl text-primary">download</span>
            </a>
          )
        })}
      </div>

      <p className="text-center text-sm text-neutral-500 mt-6">
        מומלץ להתקין ישירות על כונן USB, כדי שאותו כונן ישמש להורדה במחשב המקוון ולעדכון במחשב הלא-מקוון.{' '}
        <a href={`${repoUrl}/releases`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          כל הגרסאות
        </a>
      </p>
    </div>
  )
}
