// רשת "מצב כללי" — לפי מספר הפריטים, כך שאף פריט לא נשאר לבד בשורה (6 → 2/3/6 עמודות, 4 → 2/4).
// לפי רוחב האזור (container query), כמו רשת הכרטיסים. מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
const BY_COUNT = {
  4: 'grid grid-cols-2 gap-x-6 gap-y-4 @2xl:grid-cols-4',
  6: 'grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3 @5xl:grid-cols-6',
}

export function statsGridClass(count) {
  return BY_COUNT[count] ?? 'grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3'
}
