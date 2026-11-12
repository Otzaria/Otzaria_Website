'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import EmptyState from '@/components/ui/EmptyState'
import Loader from '@/components/ui/Loader'
import { errorToast } from '@/components/admin/list/adminRequest'
import { viewHref } from '@/lib/adminPlugins/pluginsQuery'
import { toggleCategoryPlugin } from './pluginsApi'

/**
 * לשונית "שיבוץ" (היה חלון "ערוך שיבוץ"): באילו קטגוריות התוסף מופיע בחנות. כל סימון נשמר מיד
 * (וההחזרה — סימון נוסף), ולכן בלי "שמור" ובלי "בטל". קטגוריה מוסתרת — מסומנת כך.
 * onCategory — הקטגוריה המעודכנת מהשרת, לעדכון הרשימה (עמודת הקטגוריות, הסינון).
 *
 * @param {{ plugin: any, categories: any[] | null, toast: any, onCategory: (category: any) => void }} props
 */
export default function PluginAssignPane({ plugin, categories, toast, onCategory }) {
  const [working, setWorking] = useState(null)

  if (!categories) {
    return <EmptyState tone="plain" icon="cloud_off" title="הקטגוריות לא נטענו" description="רענן את העמוד ונסה שוב." as="h3" />
  }
  if (categories.length === 0) {
    return (
      <EmptyState
        tone="plain"
        icon="category"
        title="עדיין אין קטגוריות"
        description={<>אפשר ליצור קטגוריה ב<a href={viewHref('layout')} className="text-primary underline underline-offset-2">סידור החנות</a>.</>}
        as="h3"
      />
    )
  }

  const toggle = async (category, checked) => {
    setWorking(category.id)
    try {
      const result = await toggleCategoryPlugin(category.id, plugin._id, checked)
      if (result.category) onCategory(result.category)
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לעדכן את השיבוץ.'))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-on-surface-variant">
        כל שינוי נשמר מיד. אין חובה לשבץ: תוסף שלא שובץ זמין בחיפוש ובדף &quot;כל התוספים&quot;.
      </p>
      <ul className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
        {categories.map((category) => {
          const checked = category.plugins.some((p) => p.id === plugin._id)
          return (
            <li key={category.id} className="flex min-h-(--touch-target) items-center gap-2 px-1">
              <Checkbox
                id={`assign-${category.id}`}
                checked={checked}
                disabled={working !== null}
                onChange={(next) => toggle(category, next)}
                label={category.name}
              />
              <label htmlFor={`assign-${category.id}`} className="min-w-0 flex-1 cursor-pointer truncate py-2 text-body-md text-on-surface">{category.name}</label>
              {!category.isVisible && <Badge icon="visibility_off">מוסתרת</Badge>}
              {working === category.id && <Loader size="inline" label="שומר…" tone="primary" className="me-2 text-icon-sm" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
