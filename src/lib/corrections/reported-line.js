/**
 * השורה שהתוכנה/התוסף דיווחו עליה (location.lineIndex) בקובץ הספר שאותר — כשהשורה עצמה לא אותרה
 * בוודאות. בדרך כלל זו אותה שורה גם במקור העדכני, ולכן אפשר להציג אותה ישירות במקום לחפש בגיטהאב.
 * @param {{report:object, source:object|null, located:boolean}} args
 * @returns {{path:string, lineIndex:number}|null}
 */
export function reportedLinePick({ report, source, located }) {
  if (located || !source?.path) return null;
  const lineIndex = report?.location?.lineIndex;
  if (!Number.isSafeInteger(lineIndex) || lineIndex < 0) return null;
  return { path: source.path, lineIndex };
}
