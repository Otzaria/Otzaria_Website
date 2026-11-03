/**
 * Navigation links and menu configurations
 */

export const LIBRARY_NAV_LINKS = [
  { href: '/', label: 'בית', icon: 'home' },
  { href: '/library/books', label: 'ספרים', icon: 'library_books' },
  { href: '/library/dicta-edit', label: 'תיקוני ספרים', icon: 'rule' },
  { href: '/library/acronyms', label: 'כינויים וראשי תיבות', icon: 'short_text' },
  { href: '/library/info', label: 'מידע על ספרים', icon: 'info' },
  { href: '/library/users', label: 'משתמשים', icon: 'people' },
  { href: '/library/upload', label: 'הוספת ספר', icon: 'upload' },
  { href: '/library/editingtools', label: 'כלי עריכה', icon: 'construction' }
]

/**
 * תפריט הכותרת העליונה. פריט עם children נפתח לרשימה (NavDropdown; בנייד — קבוצה מקוננת).
 * children[].more — "עוד...": מופרד בקו, והוא הקישור לדף הפריט עצמו.
 */
export const MAIN_NAV_LINKS = [
  {
    href: '/library',
    label: 'עזור לספרייה',
    highlight: true,
    children: [
      { href: '/donate', label: 'תרום לאוצריא', customIcon: 'donate' },
      { href: '/library/books', label: 'השתתף בעריכת ספרים', icon: 'edit_note' },
      { href: '/library/upload', label: 'העלה ספר חדש', icon: 'upload_file' },
      { href: '/library/acronyms', label: 'הוסף כינויים וראשי תיבות', icon: 'short_text' },
      { href: '/library/info', label: 'הוסף מידע על ספרים', icon: 'info' },
      { href: '/library/page-proof', label: 'הגהה לאימון המודלים', icon: 'fact_check' },
      { href: '/library/tzurat-hadaf', label: 'צורת הדף — השוואה לדפוס', icon: 'auto_stories' },
      { href: '/library', label: 'דרכים נוספות לסיוע', more: true }
    ]
  },
  { href: '/#download', label: 'הורדה', highlight: false },
  { href: '/offline', label: 'עדכון לא-מקוון', highlight: false },
  { href: '/plugins', label: 'תוספים', highlight: false },
  { href: '/docs', label: 'מדריכים', highlight: false },
  { href: '/faq', label: 'שאלות נפוצות', highlight: false },
  // hint — רמז התרומה: בועה בריחוף/פוקוס על הכפתור שבכותרת, ושורה בתפריט הנייד (DonationButton)
  { href: '/donate', label: 'תרומות', customIcon: 'donate', emphasis: 'donation', hint: 'אין לאוצריא גוף מממן: אתה הכוח המניע שלה' },
  { href: '/forum', label: 'פורום', external: true, highlight: false }
]

export const FOOTER_QUICK_LINKS = [
  { href: '/', label: 'אוצריא - תוכנה', icon: 'link' },
  { href: '/library', label: 'הספרייה', icon: 'link' },
  { href: '/library/users', label: 'משתמשים', icon: 'link' },
  { href: '/library/dashboard', label: 'האזור האישי', icon: 'link' }
]

export const FOOTER_EXTERNAL_LINKS = [
  { href: 'https://github.com/Otzaria', label: 'GitHub - אוצריא', icon: 'open_in_new' },
  { 
    href: 'https://otzaria.org/forum', 
    label: 'פורום אוצריא', 
    icon: 'open_in_new' 
  }
]
