'use client'

import { useId } from 'react'
import { FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { cx } from '@/components/ui/cx'

/**
 * שדה בטופסי החלונות של המקורות הפרטיים (SourceEditModal / OutreachEditModal): תווית גלויה שמחוברת
 * לשדה (htmlFor), ושדה בסגנון fieldStyles. kind: input (ברירת מחדל) / textarea / select (options — ילדים).
 * ltr — שדה טלפון/מייל: כיוון שמאל-לימין, מיושר לימין כמו שאר הטופס.
 *
 * @param {{ label: import('react').ReactNode, value: string, onChange: (value: string) => void,
 *   kind?: 'input' | 'textarea' | 'select', type?: string, ltr?: boolean, className?: string,
 *   children?: import('react').ReactNode } & Record<string, any>} props
 */
export default function ModalField({ label, value, onChange, kind = 'input', type = 'text', ltr = false, className, children, ...rest }) {
  const id = useId()
  const common = {
    ...rest,
    id,
    value,
    onChange: (e) => onChange(e.target.value),
    dir: ltr ? 'ltr' : undefined,
    className: fieldClasses({ kind, className: ltr ? 'text-end' : undefined }),
  }
  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className={FIELD_LABEL_COMPACT}>{label}</label>
      {kind === 'select' ? <select {...common}>{children}</select>
        : kind === 'textarea' ? <textarea rows={3} {...common} />
          : <input type={type} {...common} />}
    </div>
  )
}
