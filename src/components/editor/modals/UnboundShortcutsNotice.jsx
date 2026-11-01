import Button from '@/components/ui/Button';
import { formatShortcut } from '@/lib/shortcuts';

/**
 * הודעה על פעולה שהקיצור שלה הוסר בהעברת גרסת הקיצורים: הקיצור הישן התנגש בקיצור של הדפדפן
 * (למשל Ctrl+Shift+I פותח את כלי המפתחים), והקיצור החלופי כבר היה תפוס אצל המשתמש.
 * @param {{ actionId: string, from: string, to: string, conflictWith?: string }} item
 * @param {(actionId: string) => string} labelOf
 */
export function unboundShortcutMessage(item, labelOf) {
  const busy = item.conflictWith ? ` (משמש ל"${labelOf(item.conflictWith)}")` : '';
  return `הקיצור ${formatShortcut(item.from)} של "${labelOf(item.actionId)}" הוסר, כי הוא מתנגש בקיצור של הדפדפן, והקיצור החלופי ${formatShortcut(item.to)} כבר תפוס${busy}. הפעולה כרגע בלי קיצור — אפשר להגדיר לה קיצור אחר כאן.`;
}

/**
 * @param {{ items: { actionId: string, from: string, to: string, conflictWith?: string }[],
 *   labelOf: (actionId: string) => string, onDismiss?: () => void }} props
 */
export default function UnboundShortcutsNotice({ items, labelOf, onDismiss }) {
  if (!items?.length) return null;
  return (
    <div role="status" className="space-y-2 rounded-(--radius-card) bg-surface-container-high px-4 py-3 text-body-sm text-on-surface">
      {items.map((item) => (
        <p key={item.actionId}>{unboundShortcutMessage(item, labelOf)}</p>
      ))}
      {onDismiss && (
        <Button variant="text" size="sm" onClick={onDismiss}>הבנתי</Button>
      )}
    </div>
  );
}
