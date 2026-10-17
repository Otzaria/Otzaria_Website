import Card from '@/components/ui/Card'
import SectionHeading from '@/components/ui/SectionHeading'
import FaqItem from './FaqItem'
import { categoryHeadingId } from './faqContent'

/**
 * קבוצת שאלות של קטגוריה אחת: כותרת h2 (שם הקטגוריה) וכרטיס אחד שבו השאלות ברשימה עם קו
 * מפריד — כמו "טוב לדעת" ב-/offline. overflow-hidden — רקע הריחוף של השאלה הראשונה והאחרונה
 * לא חורג מפינות הכרטיס (ולכן טבעת הפוקוס של השאלה פנימית — FOCUS_RING_INSET).
 */
export default function FaqCategorySection({ category, items }) {
  const headingId = categoryHeadingId(category.id)
  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        as="h2"
        size="md"
        align="start"
        ornament={false}
        spacing="none"
        title={category.label}
        className="mb-3 px-1"
      />
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-outline-variant">
          {items.map((faq) => (
            <li key={faq.id}>
              <FaqItem faq={faq} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
