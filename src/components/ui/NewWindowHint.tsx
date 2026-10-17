/**
 * תוספת לקוראי מסך בסוף קישור שנפתח בחלון חדש (target="_blank"): " (נפתח בחלון חדש)",
 * או עם יעד — " ב-GitHub (נפתח בחלון חדש)". מוסתר חזותית (sr-only).
 */
export default function NewWindowHint({ destination }: { destination?: string }) {
  return <span className="sr-only">{destination ? ` ${destination} (נפתח בחלון חדש)` : ' (נפתח בחלון חדש)'}</span>
}
