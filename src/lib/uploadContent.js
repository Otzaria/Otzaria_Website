/**
 * מאחד רשימת קטעי תוכן (מ-uploads שונים) למחרוזת אחת,
 * כאשר בין כל שני קטעים סמוכים מוכנס מפריד קבוע.
 * @param {string[]} contents - מערך תכני ההעלאות, לפי סדר האיחוד הרצוי
 * @returns {string} התוכן המאוחד
 */
export function combineUploadsContent(contents) {
  return contents.map((content, index) => {
    const separator = index < contents.length - 1 ? '\n\n---\n\n' : '';
    return content + separator;
  }).join('');
}
