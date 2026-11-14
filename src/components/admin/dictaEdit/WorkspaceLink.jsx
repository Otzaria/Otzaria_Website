import Button from '@/components/ui/Button'

/**
 * "חזרה למרחב העריכה" — בכותרת של "הצעות עריכה" ו"התנגשויות בסנכרון". מפקח עובר בין המרחב (פתיחת ספר
 * ותיקון ביד) לבין המסכים האלה; במסך הקודם הקישור היה בראש העמוד. בטלפון — אייקון בלבד (השם נשאר נגיש).
 */
export default function WorkspaceLink() {
  return (
    <Button href="/library/dicta-edit" variant="text" size="sm" icon="arrow_forward" aria-label="חזרה למרחב העריכה">
      <span className="max-sm:sr-only">חזרה למרחב העריכה</span>
    </Button>
  )
}
