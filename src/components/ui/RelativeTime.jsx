import { ageText, fullDateText } from '@/lib/adminTerms'

/**
 * "מתי" — זמן יחסי ("היום", "אתמול", "לפני 3 ימים"), ובריחוף / לקורא המסך — התאריך המלא עם השעה (fullDateText).
 * format — ניסוח אחר לטקסט הגלוי (למשל שעה בהודעה של היום); prefix — מילה לפני הזמן ("עודכן").
 * הכול בשעון ירושלים (lib/adminTerms), כך שהשרת והדפדפן מסכימים; ובכל זאת — מעבר חצות בין הרינדור בשרת
 * להידרציה משנה את "היום", ולכן suppressHydrationWarning. תאריך לא תקין — כלום.
 *
 * @param {{ date: any, format?: (date: any) => string, prefix?: string }} props
 */
export default function RelativeTime({ date, format = ageText, prefix }) {
  const text = format(date)
  if (!text) return null
  const time = <time dateTime={new Date(date).toISOString()} title={fullDateText(date)} suppressHydrationWarning>{text}</time>
  if (!prefix) return time
  return <span>{prefix} {time}</span>
}
