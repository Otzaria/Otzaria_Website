'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import EventFilters from './EventFilters'
import { EMPTY_FILTERS, criteriaToSearchParams, filtersToCriteria } from './labels'

const EXPORT_URL = '/api/search-feedback/admin/export'

/** הכתובת להורדה לפי המסננים — אותה כתובת ואותם פרמטרים כמו קודם */
export function exportHref(filters, models) {
  const query = criteriaToSearchParams(filtersToCriteria(filters, models)).toString()
  return query ? `${EXPORT_URL}?${query}` : EXPORT_URL
}

/**
 * "הורד נתונים" (מתפריט ⋮ של הכותרת): בחירת טווח, סוג ומודל, והורדה בקישור רגיל (GET, כמו קודם). שם הפורמט —
 * בתיאור בלבד. models: [{modelFamilyId, modelQuantization}]
 */
export default function ExportDialog({ models, onClose }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const href = exportHref(filters, models)
  return (
    <Dialog
      title="הורדת נתוני המשוב"
      subtitle="קובץ עם שורה לכל אירוע, לאימון מודלים. אירועים של התקנות חסומות לא נכללים."
      onClose={onClose}
      footer={(
        <>
          <Button variant="text" onClick={onClose}>ביטול</Button>
          <Button variant="filled" icon="download" href={href} download onClick={onClose}>הורד</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <EventFilters filters={filters} onChange={setFilters} models={models} />
        <p className="text-body-sm text-on-surface-variant">סוג הקובץ (לצוות הטכני): <bdi dir="ltr">NDJSON</bdi></p>
      </div>
    </Dialog>
  )
}
