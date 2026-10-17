import { splitLatinRuns } from './faqContent'

/**
 * טקסט של שאלה או תשובה, כשמונחים לועזיים בו מבודדים (bdi dir="ltr") — בלי בידוד, "(Web)?"
 * ו-"iPhone / iPad?" מתהפכים בשורה עברית. הנוסח עצמו לא משתנה (splitLatinRuns משמר כל תו).
 * לא ui/Ltr: הוא nowrap, ופקודה ארוכה בתשובה (Linux) חייבת להישבר ברוחב 390.
 */
export default function FaqText({ text }) {
  return splitLatinRuns(text).map((part, i) =>
    part.ltr ? <bdi key={i} dir="ltr">{part.text}</bdi> : part.text
  )
}
