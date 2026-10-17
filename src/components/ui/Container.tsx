import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/**
 * רוחבי המכל — מקור אחד (layout.css → --container-*):
 *   content — רוחב התוכן של העמוד (72rem; מ-2xl — 80rem). זה הרוחב שהכותרת והפוטר מתיישרים אליו.
 *   narrow  — אזור ממוקד: קריאה לפעולה, טופס קצר, טקסט רציף (48rem).
 *   measure — פסקה מתחת לכותרת (42rem).
 *   full    — בלי הגבלה (רק mx-auto w-full).
 */
export const CONTAINER_SIZES = {
  content: 'max-w-content 2xl:max-w-content-wide',
  narrow: 'max-w-narrow',
  measure: 'max-w-measure',
  full: ''
} as const

export type ContainerSize = keyof typeof CONTAINER_SIZES

export function containerClasses(size: ContainerSize = 'content', className?: string) {
  return cx('mx-auto w-full', CONTAINER_SIZES[size], className)
}

/** מכל ממורכז ברוחב מוגדר. בלי ריפוד צד — הריפוד שייך לאזור (ui/Section), כדי שלא יוכפל. */
export default function Container({ size = 'content', as: Tag = 'div', className, children, ...rest }: {
  size?: ContainerSize
  as?: ElementType
  className?: string
  children?: ReactNode
} & HTMLAttributes<HTMLElement>) {
  return <Tag {...rest} className={containerClasses(size, className)}>{children}</Tag>
}
