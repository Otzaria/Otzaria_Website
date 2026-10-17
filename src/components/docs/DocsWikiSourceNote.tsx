import AppIcon from '@/components/ui/AppIcon'
import { PROSE } from './proseClasses'

/** הערת המקור בסוף דף ויקי: הדף נטען מהוויקי, וקישור לעריכתו שם. */
export default function DocsWikiSourceNote({ pageName, className }: { pageName: string; className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-card bg-surface-container-low p-4 text-body-sm text-on-surface-variant ${className ?? ''}`}>
      <AppIcon name="sync" className="mt-0.5 shrink-0 text-xl text-primary" />
      <p>
        דף זה נטען אוטומטית מהוויקי של הפרויקט ב-GitHub. מצאתם טעות או רוצים להוסיף?{' '}
        <a
          href={`https://github.com/Otzaria/otzaria/wiki/${pageName}`}
          target="_blank"
          rel="noopener noreferrer"
          className={PROSE.link}
        >
          ערכו את הדף בוויקי
        </a>{' '}
        — והתיקון יופיע כאן.
      </p>
    </div>
  )
}
