/**
 * הודעות שגיאה בעברית לקודי השגיאה של API המתנדבים (טהור, משותף לדף הדיווח ולפעולות).
 */
export const ERROR_TEXT = {
  stale_view: 'התצוגה לא עדכנית — הדיווח או המקור השתנו מאז שנטען. רעננו ובדקו שוב.',
  claim_conflict: 'מתנדב אחר כבר לקח את הדיווח.',
  approved_locked: 'הדיווח כבר אושר ונמצא בפרסום — אי אפשר לקחת אותו לטיפול. אפשר רק לדחות.',
  publish_in_progress: 'הפרסום ל-GitHub מתבצע כרגע. נסו שוב בעוד דקה.',
  not_approved: 'הדיווח אינו ממתין לפרסום.',
  claim_required: 'יש לקחת את הדיווח לטיפול קודם (או שתוקף השיוך פג).',
  source_not_resolved: 'המקור לא אותר בוודאות או השתנה — אי אפשר לאשר. אפשר לבחור מקור ידנית ולערוך.',
  final_state: 'הדיווח כבר סגור.',
  not_reopenable: 'אי אפשר לפתוח מחדש דיווח שתיקונו כבר פורסם.',
  reason_required: 'חובה לציין סיבה.',
  service_disabled: 'שירות הבדיקה אינו פעיל.',
  path_not_allowed: 'הנתיב אינו מותר (רק קבצי txt תחת תיקיות הספרים במאגר).',
  file_not_found: 'הקובץ לא נמצא במאגר — בדקו את שם הספר והנתיב.',
  non_utf8_source: 'הקובץ אינו בקידוד UTF-8 ולא ניתן לערוך אותו כאן.',
  line_out_of_range: 'מספר השורה גדול ממספר השורות בקובץ.',
  no_proposal: 'אין הצעת תיקון — השתמשו ב"עריכה ואז אישור".',
  proposal_identical: 'הנוסח זהה למקור.',
  source_unavailable: 'לא ניתן לקרוא את המקור מ-GitHub כרגע.',
  Forbidden: 'אין לך הרשאה לפעולה זו.',
};

/**
 * @param {{error?:string, lineCount?:number}|null|undefined} body  גוף תשובת השגיאה
 * @param {string} fallback
 */
export function errorText(body, fallback = 'הפעולה נכשלה') {
  const code = body?.error;
  if (code === 'line_out_of_range' && Number.isInteger(body.lineCount)) {
    return `מספר השורה גדול ממספר השורות בקובץ (${body.lineCount}).`;
  }
  return ERROR_TEXT[code] || code || fallback;
}
