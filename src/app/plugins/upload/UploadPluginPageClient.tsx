'use client'

import Section from '@/components/ui/Section'
import StorePageHeader from '@/components/plugins/StorePageHeader'
import UploadPluginForm from '@/components/plugins/upload/UploadPluginForm'
import { useUploadPluginForm } from '@/components/plugins/upload/useUploadPluginForm'
import type { TagCount } from '@/components/plugins/listing/TagFilterChips'

/**
 * העלאת תוסף חדש לחנות — החלק בצד הלקוח (page.tsx טוען בשרת את מאגר התגיות ומעביר אותו לכאן).
 * הלוגיקה (קריאת manifest.json, בדיקות הקבצים, השליחה ל-/api/plugins/upload) — ב-useUploadPluginForm;
 * הטופס עצמו — ב-components/plugins/upload/.
 * tagPool — התגיות הקיימות בחנות להצעה בשדה התגיות; null — לא נטען בשרת, והשדה טוען בעצמו.
 */
export default function UploadPluginPageClient({ tagPool = null, serviceEnabled = false }: {
  tagPool?: TagCount[] | null
  /** תוספי שירות מופעלים בשרת — מציג את "דורש שירות חיצוני" */
  serviceEnabled?: boolean
}) {
  const form = useUploadPluginForm({ serviceEnabled })

  return (
    <main id="main-content" className="flex-1">
      <StorePageHeader
        titleId="upload-plugin-title"
        container="narrow"
        breadcrumbs={[{ label: 'חנות התוספים', href: '/plugins' }, { label: 'העלאת תוסף' }]}
        title="העלאת תוסף חדש"
        subtitle="מלא את הפרטים הבאים כדי להעלות תוסף לחנות. התוסף יעבור אישור מנהל לפני שיופיע בחנות."
      />
      <Section spacing="none" container="narrow">
        <UploadPluginForm form={form} tagPool={tagPool} />
      </Section>
    </main>
  )
}
