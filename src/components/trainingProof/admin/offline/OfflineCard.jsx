'use client'

import { useState } from 'react'
import ExpandToggle from '@/components/ui/ExpandToggle'
import { SECTION_LABELS } from '@/lib/trainingProof/vocab'
import { Card, Muted } from '../bits'
import OfflineDownload from './OfflineDownload'
import DecisionsUpload from './DecisionsUpload'

// "עבודה בלי אינטרנט" (docs/115) בראש לשונית הסקירה: הורדה של מה שממתין לאישור בחלק, כקובץ
// HTML שנפתח בדפדפן, והעלאה של קובץ-ההחלטות שנשמר בו. סגור כברירת-מחדל — לא מפריע לסקירה כאן.
export default function OfflineCard({ section, onApplied }) {
  const [open, setOpen] = useState(false)
  return (
    <Card
      title="עבודה בלי אינטרנט"
      icon="wifi_off"
      actions={<ExpandToggle expanded={open} onToggle={() => setOpen((x) => !x)} label={open ? 'סגור' : 'פתח'} />}
    >
      {open ? (
        <div className="flex flex-col gap-4" data-testid="tp-offline-card">
          <Muted>
            מורידים את מה שממתין לאישור ב{SECTION_LABELS[section]}, עוברים עליו בדפדפן גם בלי אינטרנט (אשר · דחה
            {section === 'frames' ? ' · "לתקן באתר"' : ' · תקן ואשר'}), שומרים שם &quot;קובץ-החלטות&quot;, ומעלים אותו כאן. ההורדה לא
            משנה דבר באתר: אפשר להמשיך לאשר גם כאן, ומה שכבר טופל — לא יידרס.
          </Muted>
          <section className="flex flex-col gap-2">
            <h3 className="text-title-sm">1. הורדה</h3>
            <OfflineDownload section={section} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-title-sm">2. העלאת ההחלטות</h3>
            <DecisionsUpload section={section} onApplied={onApplied} />
          </section>
        </div>
      ) : (
        <Muted>להוריד את מה שממתין לאישור, לעבור עליו בלי אינטרנט ולהעלות את ההחלטות.</Muted>
      )}
    </Card>
  )
}
