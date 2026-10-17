import { buttonClasses } from '@/components/ui/buttonStyles'

/**
 * סינון לפי קטגוריה: כפתורי מתג (aria-pressed) בקבוצה עם שם נגיש. הנבחר — tonal, השאר —
 * outlined (שפת שבבי הסינון של Material 3, בלי filled — זו לא פעולה ראשית).
 */
export default function FaqCategoryFilter({ categories, active, onChange }) {
  return (
    <div role="group" aria-label="סינון לפי קטגוריה" className="flex flex-wrap justify-center gap-2">
      {categories.map((category) => {
        const selected = category.id === active
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(category.id)}
            className={buttonClasses({ variant: selected ? 'tonal' : 'outlined', size: 'sm' })}
          >
            {category.label}
          </button>
        )
      })}
    </div>
  )
}
