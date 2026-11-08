/**
 * שם ספר במירכאות בתוך משפט: השם בתוך <bdi>, כדי שמספר או אותיות לועזיות בסוף השם ("כתב סופר 49-90")
 * לא יגררו את המירכאה הסוגרת למקום הלא נכון.
 * @param {{ name: string }} props
 */
export default function QuotedName({ name }) {
  return <>&quot;<bdi>{name}</bdi>&quot;</>
}
