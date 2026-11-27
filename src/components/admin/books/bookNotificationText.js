// מה אומרים למנהל על ההודעה למנויים אחרי "הצג ושלח הודעה" / העלאה עם הודעה.
// השרת לא שולח בתוך הבקשה — הוא מכניס לתור ומחזיר notification.status (issue #306).

/**
 * @param {{ status?: string, total?: number } | undefined} notification
 * @returns {{ text: string, problem: boolean }} text — המשך המשפט אחרי שם הספר ("מוצג עכשיו לכולם…")
 */
export function notificationOutcome(notification) {
  const status = notification?.status
  const total = Number(notification?.total) || 0
  switch (status) {
    case 'queued':
      return { text: total === 1 ? 'ההודעה למנוי נשלחת ברקע' : `ההודעה ל־${total} המנויים נשלחת ברקע, בהדרגה`, problem: false }
    case 'already_queued':
      return { text: 'ההודעה למנויים כבר נשלחת — לא נשלחה שוב', problem: false }
    case 'already_sent':
      return { text: 'ההודעה על הספר הזה כבר נשלחה בעבר — לא נשלחה שוב', problem: false }
    case 'no_subscribers':
      return { text: 'אין מנויים לשלוח להם הודעה', problem: false }
    default:
      return { text: 'אבל לא הצלחנו לתזמן את ההודעה למנויים', problem: true }
  }
}
