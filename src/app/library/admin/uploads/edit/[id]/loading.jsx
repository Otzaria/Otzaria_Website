import Loader from '@/components/ui/Loader'

// עריכת העותק נפרשת על כל המסך — ולכן גם הטעינה שלה, ולא שלד רשימת ההעלאות (uploads/loading.jsx)
export default function Loading() {
  return (
    <div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-background">
      <Loader size="md" label="טוען את עותק העריכה…" />
    </div>
  )
}
