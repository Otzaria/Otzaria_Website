import LoadingSpinner from '@/components/ui/LoadingSpinner'

// fallback מיידי למעבר לחנות התוספים ולדפי התוספים — רק התוכן; הכותרת והפוטר ב-layout.tsx
// נשארים על המסך
export default function PluginsLoading() {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center py-24">
      <LoadingSpinner message="טוען תוספים..." size="lg" />
    </main>
  )
}
