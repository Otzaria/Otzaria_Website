import LoadingSpinner from '@/components/ui/LoadingSpinner'

// fallback מיידי למעבר בין המדריכים (חלקם נשלפים מהוויקי בזמן הבקשה)
export default function DocsLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner message="טוען מדריך..." size="lg" />
    </div>
  )
}
