/**
 * Navigation links and menu configurations
 */

export const LIBRARY_NAV_LINKS = [
  { href: '/', label: 'בית', icon: 'home' },
  { href: '/library/books', label: 'ספרים', icon: 'library_books' },
  { href: '/library/dicta-books', label: 'ספרי דיקטה', icon: 'edit_document' },
  { href: '/library/users', label: 'משתמשים', icon: 'people' },
  { href: '/library/upload', label: 'הוספת ספר', icon: 'upload' },
  { href: '/library/editingtools', label: 'כלי עריכה', icon: 'construction' }
]

export const MAIN_NAV_LINKS = [
  { href: '/library', label: 'ספריית אוצריא', highlight: true },
  { href: '/#download', label: 'הורדה', highlight: false },
  { href: '/docs', label: 'מדריכים', highlight: false },
  { href: '/faq', label: 'שאלות נפוצות', highlight: false },
  { href: '/donate', label: 'תרומות', highlight: false },
  { href: '/forum', label: 'פורום', external: true, highlight: false }
]

export const FOOTER_QUICK_LINKS = [
  { href: '/', label: 'אוצריא - תוכנה', icon: 'link' },
  { href: '/library', label: 'הספרייה', icon: 'link' },
  { href: '/library/users', label: 'משתמשים', icon: 'link' },
  { href: '/library/dashboard', label: 'איזור אישי', icon: 'link' }
]

export const FOOTER_EXTERNAL_LINKS = [
  { href: 'https://github.com/Otzaria', label: 'GitHub - אוצריא', icon: 'open_in_new' },
  { 
    href: 'https://otzaria.org/forum', 
    label: 'פורום אוצריא', 
    icon: 'open_in_new' 
  }
]
