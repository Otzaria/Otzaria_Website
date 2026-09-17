/**
 * DictaStatusBadge - תגית סטטוס ספר דיקטה (פנוי/בעריכה/הושלם)
 * חולצה מ-AdminDictaBooksClient.jsx (getStatusBadge) ללא שינוי בהתנהגות.
 */
export default function DictaStatusBadge({ status }) {
  switch (status) {
    case 'available':
      return <span className="bg-success-100 text-success-800 px-2 py-1 rounded-full text-xs">פנוי</span>
    case 'in-progress':
      return <span className="bg-warning-strong-100 text-warning-strong-800 px-2 py-1 rounded-full text-xs">בעריכה</span>
    case 'completed':
      return <span className="bg-info-100 text-info-800 px-2 py-1 rounded-full text-xs">הושלם</span>
    default:
      return status
  }
}
