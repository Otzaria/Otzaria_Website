import InfoCard from '@/components/ui/InfoCard'

// כרטיס יכולת — ui/InfoCard (AppCard של אוצריא: משטח card, בלי מסגרת ובלי צל; האריח והכותרת
// בשורה אחת, והתיאור מתחתיהם לכל רוחב הכרטיס — כך הכרטיס נמוך יותר, והכותרת נקראת מיד יחד
// עם האייקון שלה). כאן רק מה שמיוחד לדף הבית: כניסה מדורגת (index) וריחוף.
// הריחוף (card-selected) על כרטיס שאינו לחיץ — נשמר כפי שהיה; ראו design-system.md (שאלות פתוחות).
export default function FeatureCard({ icon, title, description, index = 0 }: {
  icon: string
  title: string
  description: string
  index?: number
}) {
  return (
    <InfoCard
      icon={icon}
      title={title}
      style={{ animationDelay: `${index * 0.06}s` }}
      className="w-full transition-colors duration-200 hover:bg-card-selected animate-enter-up"
    >
      {description}
    </InfoCard>
  )
}
