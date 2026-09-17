/** תגית סיכום קטנה ("תווית: ערך") — משותפת בין כרטיסיית המקורות וכרטיסיית הפניות */
export default function Chip({ label, value, tone = 'bg-surface-variant text-on-surface' }) {
  return (
    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${tone}`}>
      {label}: {value}
    </span>
  )
}
