import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import TabLinks from '@/components/ui/TabLinks'
import { adminScreenTitle } from '@/lib/adminNav'

export const BOOKS_TITLE_ID = 'books-title'

const TABS = [
  { id: 'books', href: '/library/admin/books', label: 'ספרים', icon: 'menu_book' },
  { id: 'categories', href: '/library/admin/books/categories', label: 'קטגוריות', icon: 'category' },
  { id: 'instructions', href: '/library/admin/books/instructions', label: 'הנחיות כלליות', icon: 'gavel' },
  { id: 'subscribers', href: '/library/admin/books/subscribers', label: 'מנויים', icon: 'notifications_active' },
]

export const DESCRIPTIONS = {
  books: 'ספרים לתמלול מ-PDF, ומצב העבודה עליהם.',
  categories: 'הקטגוריות שספרים משויכים אליהן, והצבע של כל אחת.',
  instructions: 'הנחיות שמופיעות בכל ספר, מתחת להנחיות העריכה של הספר עצמו.',
  subscribers: 'מי שביקש לקבל הודעה במייל כשספר חדש מוצג לכולם.',
}

/**
 * הכותרת המשותפת ללשוניות של מסך הספרים: "ספרים", שורת הסבר לפי הלשונית, פעולה ראשית ו-⋮ (בלשונית
 * הספרים), ומתחת — הלשוניות. ההגדרות (קטגוריות, הנחיות כלליות, מנויים) הן לשוניות ולא פריטים חבויים
 * ב-⋮: הן עמודים שלמים שעובדים בהם (רשימה לעריכה, טופס ארוך), ולשונית גלויה גם מגלה שהן קיימות.
 * כל לשונית — כתובת משלה תחת /library/admin/books, שמורשית לאותם תפקידים (proxy.js).
 * @param {{ tab: 'books' | 'categories' | 'instructions' | 'subscribers', action?: import('react').ReactNode,
 *   menuItems?: any[] }} props
 */
export default function BooksHeader({ tab, action, menuItems }) {
  return (
    <>
      <AdminScreenHeader id={BOOKS_TITLE_ID} title={adminScreenTitle('books')} description={DESCRIPTIONS[tab]} action={action} menuItems={menuItems} menuLabel="עוד פעולות על ספרים" />
      <TabLinks label="ספרים והגדרות" activeId={tab} items={TABS} />
    </>
  )
}
