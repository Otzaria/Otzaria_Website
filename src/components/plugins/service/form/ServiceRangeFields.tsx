'use client'

import CheckboxField from '@/components/plugins/form/CheckboxField'
import FormField from '@/components/plugins/form/FormField'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'

/**
 * טווח גרסאות השירות שהתוסף עובד איתן: מינימום, ומקסימום — או "ללא תקרה" מפורש. ללא תקרה הוא הצהרת
 * תאימות לכל גרסה עתידית, ולכן אינו ברירת מחדל ומלווה באזהרה.
 */
export default function ServiceRangeFields({ min, max, noCeiling, onChange }: {
  min: string
  max: string
  noCeiling: boolean
  onChange: (patch: { rangeMin?: string; rangeMax?: string; noCeiling?: boolean }) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="service-range-min" label="גרסת שירות מינימלית" required hint="X.Y.Z">
          <input
            type="text"
            dir="ltr"
            value={min}
            onChange={(e) => onChange({ rangeMin: e.target.value })}
            className={fieldClasses()}
            placeholder="1.0.0"
            {...fieldA11yProps('service-range-min', { required: true, hint: true })}
          />
        </FormField>
        <FormField id="service-range-max" label="גרסת שירות מרבית" required={!noCeiling} hint={noCeiling ? 'ללא תקרה' : 'X.Y.Z'}>
          <input
            type="text"
            dir="ltr"
            value={noCeiling ? '' : max}
            disabled={noCeiling}
            onChange={(e) => onChange({ rangeMax: e.target.value })}
            className={fieldClasses()}
            placeholder="1.9.99"
            {...fieldA11yProps('service-range-max', { required: !noCeiling, hint: true })}
          />
        </FormField>
      </div>
      <CheckboxField
        id="service-range-no-ceiling"
        checked={noCeiling}
        onChange={(checked) => onChange({ noCeiling: checked })}
        label="ללא תקרה"
        description="טווח ללא תקרה הוא הצהרה שהתוסף יעבוד עם כל גרסה עתידית של השירות — לא ברירת מחדל. סמנו רק אם בדקתם ואתם מתחייבים לכך."
      />
    </div>
  )
}
