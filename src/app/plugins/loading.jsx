import LoadingSpinner from '@/components/ui/LoadingSpinner'

// fallback מיידי למעבר לחנות התוספים ולדפי התוספים
export default function PluginsLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner message="טוען תוספים..." size="lg" />
    </div>
  )
}
