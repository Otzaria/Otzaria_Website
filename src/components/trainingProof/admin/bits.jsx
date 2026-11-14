'use client'

// חלקים קטנים שחוזרים בכל לשוניות הניהול של ההגהה, מעל רכיבי ui: אזור (CardSection), תג (Badge), תג-כתב,
// בורר בין שלושת החלקים (SegmentedControl), טקסט שקט ו"אין מה להציג" (EmptyText).
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import CardSection from '@/components/ui/CardSection'
import EmptyText from '@/components/ui/EmptyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { cx } from '@/components/ui/cx'
import { SECTION_LABELS, SCRIPT_LABELS } from '@/lib/trainingProof/vocab'

export const SECTION_ICONS = { ocr: 'text_fields', router: 'fork_right', frames: 'dashboard' }

// הגוונים הישנים (ok/err/…) → הגוונים של ui/Badge
const TONES = { ok: 'success', err: 'error', warn: 'warning', info: 'info', muted: 'neutral' }

export function Tag({ tone = 'muted', children, title }) {
  const badge = <Badge tone={TONES[tone] || 'neutral'}>{children}</Badge>
  return title ? <span title={title} className="inline-flex">{badge}</span> : badge
}

// גוון קבוע לכל כתב — זהה בכל המסכים
const SCRIPT_TONES = { square: 'info', rashi: 'warning', latin: 'success', mixed: 'error', neutral: 'neutral' }

export function ScriptTag({ script }) {
  if (!script) return null
  return <Badge tone={SCRIPT_TONES[script] || 'neutral'}>{SCRIPT_LABELS[script] || script}</Badge>
}

// אזור בלשונית: כרטיס בלי צל ומסגרת, כותרת (עם אייקון) ופעולות בקצה
export function Card({ title, icon, actions, children, className = '' }) {
  const heading = title && (
    <span className="flex items-center gap-2">
      {icon && <AppIcon name={icon} className="text-icon-md text-primary" />}
      {title}
    </span>
  )
  return (
    <CardSection title={heading} actions={actions} className={className}>
      {children}
    </CardSection>
  )
}

// בורר בין שלושת החלקים (או חלק מהם), עם מספר הממתינים ליד כל חלק
export function SectionSwitch({ value, onChange, sections = ['ocr', 'router', 'frames'], counts = null }) {
  const options = sections.map((s) => ({
    value: s,
    label: (
      <span className="flex items-center justify-center gap-1.5">
        <AppIcon name={SECTION_ICONS[s]} className="text-icon-sm max-sm:hidden" />
        {SECTION_LABELS[s]}
        {counts?.[s] ? <span className="tabular-nums text-on-surface-variant">{counts[s].toLocaleString('he-IL')}</span> : null}
      </span>
    ),
  }))
  return <SegmentedControl label="חלק" options={options} value={value} onChange={onChange} className="self-start max-sm:w-full max-sm:*:flex-1 max-sm:*:px-2" />
}

export const Muted = ({ children, className = '' }) => <p className={cx('text-body-sm text-on-surface-variant', className)}>{children}</p>

export function Empty({ children }) {
  return <EmptyText>{children}</EmptyText>
}
