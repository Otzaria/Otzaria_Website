import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'

/** משטח הקריאה של דף מדריך: כרטיס surface על רקע הקלף, בריפוד נדיב. */
export default function DocsArticle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card as="article" padding="lg" className={className}>
      {children}
    </Card>
  )
}
