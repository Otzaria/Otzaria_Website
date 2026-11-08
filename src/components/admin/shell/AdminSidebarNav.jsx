import AdminNavGroup from './AdminNavGroup'
import AdminAttentionGroup from './AdminAttentionGroup'

/**
 * תוכן הניווט של הניהול — משותף לסרגל במחשב ולמגירה בטלפון.
 * הסדר: הקבוצה הראשונה (הלוח, בלי כותרת), אחריה "ממתין לטיפולך" (רק כשיש), ושאר הקבוצות.
 * תפקיד בלי לוח (מפתח) — "ממתין לטיפולך" ממילא ריק אצלו, והסדר נשמר.
 */
export default function AdminSidebarNav({ groups, attention, counts, activeId, onNavigate }) {
  const [first, ...rest] = groups
  const showAttentionAfterFirst = first?.id === 'home'
  return (
    <nav aria-label="ניווט הניהול">
      {showAttentionAfterFirst && <AdminNavGroup group={first} counts={counts} activeId={activeId} onNavigate={onNavigate} />}
      {attention.length > 0 && <AdminAttentionGroup items={attention} onNavigate={onNavigate} />}
      {(showAttentionAfterFirst ? rest : groups).map((group) => (
        <AdminNavGroup key={group.id} group={group} counts={counts} activeId={activeId} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
