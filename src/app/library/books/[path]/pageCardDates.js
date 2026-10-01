// לוגיקה טהורה של תאריכי התפיסה בכרטיסי העמודים בדף הספר (/library/books/[path]).
// חולץ מ-page.jsx. ה-Intl.DateTimeFormat נבנה פעם אחת ומשותף לכל הכרטיסים: בעבר
// נבנה מחדש לכל כרטיס (מאות בספר גדול), ובניית פורמטר של לוח עברי יקרה
// פי ~40 מהפורמט עצמו — זמן חסימה מורגש בטעינת הדף.

let hebrewDateFormatter = null

function getHebrewDateFormatter() {
  if (!hebrewDateFormatter) {
    hebrewDateFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }
  return hebrewDateFormatter
}

export function toGematria(num) {
  if (num === 15) return 'ט"ו';
  if (num === 16) return 'ט"ז';
  
  const letters = [
      { val: 400, char: 'ת' },
      { val: 300, char: 'ש' },
      { val: 200, char: 'ר' },
      { val: 100, char: 'ק' },
      { val: 90, char: 'צ' },
      { val: 80, char: 'פ' },
      { val: 70, char: 'ע' },
      { val: 60, char: 'ס' },
      { val: 50, char: 'נ' },
      { val: 40, char: 'מ' },
      { val: 30, char: 'ל' },
      { val: 20, char: 'כ' },
      { val: 10, char: 'י' },
      { val: 9, char: 'ט' },
      { val: 8, char: 'ח' },
      { val: 7, char: 'ז' },
      { val: 6, char: 'ו' },
      { val: 5, char: 'ה' },
      { val: 4, char: 'ד' },
      { val: 3, char: 'ג' },
      { val: 2, char: 'ב' },
      { val: 1, char: 'א' }
  ];

  let result = '';
  let n = num;
  
  for (const { val, char } of letters) {
      while (n >= val) {
          result += char;
          n -= val;
      }
  }
  
  if (result.length > 1) {
      return result.slice(0, -1) + '"' + result.slice(-1);
  } 
  return result + "'";
}

export function formatHebrewDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const parts = getHebrewDateFormatter().formatToParts(date);
    
    const dayPart = parts.find(p => p.type === 'day');
    const monthPart = parts.find(p => p.type === 'month');
    const yearPart = parts.find(p => p.type === 'year');
    
    if (!dayPart || !monthPart || !yearPart) return '';
    
    const day = parseInt(dayPart.value, 10);
    const year = parseInt(yearPart.value, 10);
    
    return `${toGematria(day)} ב${monthPart.value} ${toGematria(year % 1000)}`;
  } catch (e) {
    return '';
  }
}

export function formatTimeAgo(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'היום';
    if (diffDays === 1) return 'אתמול';
    return `לפני ${diffDays} ימים`;
  } catch (e) {
    return '';
  }
}
