// /library/admin/reminders — "תזכורות" עברו ללשונית במסך "הודעות". הכתובת הישנה (סימניות, קישורים ישנים) מפנה
// לשם. ההפניה כאן בעמוד ולא ב-proxy, כדי שההרשאות לא ישתנו: ה-proxy ממשיך לבדוק את /library/admin/reminders
// כמו קודם (מנהל תוספים, מנהל OCR וכו' — חסומים לפני שמגיעים לכאן), ורק מי שהיה מורשה מגיע להפניה.
import { redirect } from 'next/navigation'

export default function RemindersRedirect() {
  redirect('/library/admin/messages?view=reminders')
}
