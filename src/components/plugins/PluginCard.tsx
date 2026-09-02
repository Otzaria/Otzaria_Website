'use client'

// כרטיס תוסף משותף — חולץ מ-src/app/plugins/page.tsx (סעיף 7.0 בתכנון).
// ה-hook של ההתקנה הישירה (useDirectInstall) נשאר ברמת הדף; הכרטיס מקבל
// את מצב ההתקנה ואת ה-handler כ-props.

import Link from 'next/link'
import { formatPluginStatus } from '@/lib/pluginSubmission'
import { formatHebrewDate } from '@/lib/hebrewDate'
import RatingStars from '@/components/plugins/RatingStars'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import type { Plugin } from '@/components/plugins/types'

interface PluginCardProps {
  plugin: Plugin
  installState: DirectInstallState
  onInstall: (plugin: Plugin) => void
}

export default function PluginCard({ plugin, installState, onInstall }: PluginCardProps) {
  const canDirectInstall = Boolean(plugin.supportsDirectInstall && plugin.downloadUrl)

  return (
    <article
      className="flex flex-col bg-white rounded-2xl border border-neutral-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
    >
      {/* Plugin Image */}
      <Link
        href={`/plugins/${plugin.id}`}
        className="relative aspect-[16/11] bg-gradient-to-br from-primary/5 to-secondary/5 overflow-hidden"
      >
        <img
          src={plugin.image || '/logo.webp'}
          alt={plugin.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </Link>

      {/* Plugin Body */}
      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Status & Version */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            plugin.status === 'stable' ? 'bg-primary/10 text-primary' :
            plugin.status === 'beta' ? 'bg-primary/15 text-primary' :
            'bg-primary/20 text-primary'
          }`}>
            {formatPluginStatus(plugin.status)}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface text-on-surface/60">
            גרסה {plugin.version}
          </span>
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-surface text-on-surface/60"
            title="מספר הורדות"
          >
            <span className="material-symbols-outlined text-sm leading-none">download</span>
            {(plugin.downloadCount || 0).toLocaleString('he-IL')}
          </span>
          {/* התוסף אינו עובד לבדו — סימון בחנות עצמה, כדי שלא יתגלה רק אחרי ההתקנה */}
          {plugin.companion && (
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-warning-50 text-warning-900"
              title={`דורש את ${plugin.companion.name}${plugin.companion.platformLabel ? ` (${plugin.companion.platformLabel})` : ''} — תוכנה שרצה על המחשב מחוץ לאוצריא`}
            >
              <span className="material-symbols-outlined text-sm leading-none">desktop_windows</span>
              דורש תוכנה נלווית
            </span>
          )}
          {/* דירוג — מוצג רק כשיש דירוגים בפועל (ולא "0 כוכבים") */}
          {(plugin.ratingCount || 0) > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface text-on-surface/70"
              title={`דירוג ממוצע מתוך ${plugin.ratingCount} מדרגים`}
            >
              <RatingStars value={plugin.ratingAvg || 0} size="sm" />
              <span>
                {(plugin.ratingAvg || 0).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-on-surface/50"> ({plugin.ratingCount})</span>
              </span>
            </span>
          )}
        </div>

        {/* Title & Description */}
        <Link
          href={`/plugins/${plugin.id}`}
          className="block"
        >
          <h3 className="text-xl font-bold text-on-surface mb-2 group-hover:text-primary transition-colors">
            {plugin.name}
          </h3>
          <p className="text-on-surface/70 text-sm leading-relaxed line-clamp-3">
            {plugin.shortDescription}
          </p>
        </Link>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {plugin.tags?.slice(0, 4).map(tag => (
            <span
              key={tag}
              className="px-2 py-1 bg-surface rounded-full text-xs text-on-surface/60"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <a
            href={plugin.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 px-4 py-2.5 bg-primary/90 text-white rounded-full text-sm font-bold text-center hover:bg-primary transition-colors"
          >
            הורדה
          </a>
          {/* התקנה ישירה מכאן הייתה מתקינה תוסף בלי התוכנה שהוא צריך, ולכן
              תוסף כזה מוביל לדף שבו ההתקנה מסודרת לפי הצעדים. */}
          {plugin.companion && (
            <Link
              href={`/plugins/${plugin.id}`}
              className="flex-1 px-4 py-2.5 bg-white border border-primary/20 text-primary rounded-full text-sm font-bold text-center hover:bg-primary/5 transition-colors"
              title="התוסף דורש תוכנה נלווית — ההתקנה מוסברת בדף התוסף"
            >
              אופן ההתקנה
            </Link>
          )}
          {canDirectInstall && !plugin.companion && (
            <button
              onClick={() => onInstall(plugin)}
              disabled={installState.pluginId === plugin.id && installState.phase === 'waiting'}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-primary/20 text-primary rounded-full text-sm font-bold hover:bg-primary/5 transition-colors text-center disabled:cursor-default disabled:opacity-80"
            >
              {installState.pluginId === plugin.id && installState.phase === 'waiting' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                  <span>מתקין...</span>
                </>
              ) : installState.pluginId === plugin.id && installState.phase === 'success' ? (
                <span>{installState.updated ? 'עודכן בהצלחה!' : 'הותקן בהצלחה!'}</span>
              ) : installState.pluginId === plugin.id && installState.phase === 'failure' ? (
                <span>ההתקנה נכשלה - לחץ שוב לנסיון נוסף</span>
              ) : (
                <span>התקנה ישירה</span>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
          <Link
            href={`/plugins/${plugin.id}`}
            className="text-sm font-bold text-primary hover:underline"
          >
            לפרטים מלאים
          </Link>
          <span className="text-xs text-on-surface/50">
            עודכן ב־{formatHebrewDate(plugin.fileUpdatedAt || plugin.originalDate || plugin.updatedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}
