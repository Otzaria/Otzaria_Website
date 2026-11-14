// דף הגשת השירות של תוסף — דינמי, בלי מטמון: הנתונים אישיים (בעלים / מנהל תוספים) ונטענים בצד הלקוח
// מ-GET /api/service-plugins/<id>/manage. ההתחברות נאכפת ב-proxy (src/lib/protected-routes.js).
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getServicePluginConfig } from '@/lib/servicePlugins/config'
import ServiceSubmissionPageClient from './ServiceSubmissionPageClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'הגשת שירות לתוסף',
  robots: { index: false, follow: false }
}

export default async function ServiceSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!getServicePluginConfig().enabled) notFound()
  const { id } = await params
  return <ServiceSubmissionPageClient pluginId={id} />
}
