import { cx } from './cx'

/**
 * המונה שליד שם הלשונית — משותף ל-ui/Tabs ול-ui/TabLinks. מספר שקט; לקורא המסך — countLabel ("8 חדשות"), ואז
 * המספר עצמו מוסתר ממנו, או סתם רווח לפני המספר ("אשפה 291", לא "אשפה291").
 * countOnPhone=false — המספר לא מוצג בטלפון (מידע, לא משימה), אבל נשאר בשם הנגיש.
 * @param {{ count: number, countLabel?: string, countOnPhone?: boolean }} props
 */
export default function TabCount({ count, countLabel, countOnPhone = true }) {
  return (
    <>
      <span className="sr-only">{countLabel ? `, ${countLabel}` : ' '}</span>
      <span aria-hidden={countLabel ? true : undefined} className={cx('rounded-(--radius-pill) bg-surface-container-highest px-2 text-label-sm tabular-nums text-on-surface-variant', !countOnPhone && 'max-sm:sr-only')}>
        {count.toLocaleString('he-IL')}
      </span>
    </>
  )
}
