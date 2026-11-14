// עמוד דיווח תקלה — אותן הרשאות כמו הרשימה. המסך עצמו — components/admin/appReports/AppReportScreen.
// key={reportId}: מעבר לדיווח אחר ("דיווחים נוספים באותו כרטיס") מרכיב את המסך מחדש — בלי נתונים או שגיאה קודמים.
import AppReportScreen from '@/components/admin/appReports/AppReportScreen'

export default async function AppReportPage({ params }) {
  const { reportId } = await params
  return <AppReportScreen key={reportId} reportId={reportId} />
}
