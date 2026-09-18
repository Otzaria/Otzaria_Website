import StatCircle from './StatCircle'

// רשת העיגולים של "אוצריא במספרים" — תצוגה בלבד, בלי שליפת נתונים (זו ב-StatsSection),
// כדי שניתן יהיה לבדוק אותה ישירות. אין פריטים → לא מרנדרים את האזור כלל.

export type StatItem = {
  key: string
  icon: string
  label: string
  value: number
}

export default function StatsGrid({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null

  return (
    <section id="stats" aria-labelledby="stats-heading" className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <h2 id="stats-heading" className="text-4xl font-bold text-center mb-10 text-on-surface font-frank animate-enter-down">
          אוצריא במספרים
        </h2>
        {/* מובייל: שניים בשורה (בסיס 50%), והאחרון הבודד ממורכז ע"י justify-center;
            מסך רחב (lg): כל החמישה בשורה אחת */}
        <ul className="flex flex-wrap justify-center gap-4 sm:gap-6 lg:flex-nowrap xl:gap-10">
          {items.map((item, index) => (
            <li key={item.key} className="basis-[calc(50%-0.5rem)] sm:basis-auto">
              <StatCircle icon={item.icon} label={item.label} value={item.value} index={index} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
