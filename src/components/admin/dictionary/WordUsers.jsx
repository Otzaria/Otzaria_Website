import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { pairKey } from '@/lib/adminDictionaryScreen/dictionaryQuery'

/**
 * מי הוסיף את המילה למילון האישי שלו — שם, דואר (משמאל לימין), ו"דולג" אצל מי שכבר דילגו עליו.
 * כשיש כמה משתמשים — לכל אחד "אשר" / "דלג" / "הסר" משלו (כמו כל שורה במסך הקודם): הפעולה בשורה של המילה חלה על
 * כולם, וכאן — רק עליו. במשתמש יחיד אין כפילות: הפעולות בשורה של המילה.
 * @param {{ word: { word: string, users: { userId: string, name: string, email: string, word: string, skipped: boolean }[] },
 *   busyUsers?: Set<string>, disabled?: boolean, onActUser?: (word: any, user: any, action: 'approve' | 'skip' | 'remove') => void }} props
 */
export default function WordUsers({ word, busyUsers = new Set(), disabled = false, onActUser }) {
  const { users } = word
  const perUser = Boolean(onActUser) && users.length > 1
  return (
    <ul aria-label="מי הוסיף את המילה" className="mb-2 flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface-container-low px-3 py-1">
      {users.map((u) => {
        const name = u.name || u.email || 'משתמש בלי שם'
        const busy = busyUsers.has(pairKey(u.userId, u.word))
        return (
          <li key={u.userId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-body-sm">
            <bdi className="min-w-0 text-on-surface [overflow-wrap:anywhere]">{u.name || 'משתמש בלי שם'}</bdi>
            {u.email && <bdi dir="ltr" className="min-w-0 text-on-surface-variant [overflow-wrap:anywhere]">{u.email}</bdi>}
            {u.skipped && <Badge tone="neutral">דולג</Badge>}
            {perUser && (
              <span className="ms-auto flex items-center gap-0.5">
                <Button variant="text" size="sm" icon="check" loading={busy} softDisabled={disabled} onClick={() => onActUser(word, u, 'approve')}
                  aria-label={`אשר את "${word.word}" אצל ${name} — הוסף למילון הכללי`}>
                  <span className="max-sm:sr-only">אשר</span>
                </Button>
                {!u.skipped && (
                  <Button variant="text" size="sm" icon="redo" softDisabled={disabled || busy} onClick={() => onActUser(word, u, 'skip')}
                    aria-label={`דלג על "${word.word}" אצל ${name}`}>
                    <span className="max-sm:sr-only">דלג</span>
                  </Button>
                )}
                <Button variant="text" size="sm" icon="delete" className="text-error! hover:bg-error-container/60!" softDisabled={disabled || busy} onClick={() => onActUser(word, u, 'remove')}
                  aria-label={`הסר את "${word.word}" מהמילון האישי של ${name}`}>
                  <span className="max-sm:sr-only">הסר</span>
                </Button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
