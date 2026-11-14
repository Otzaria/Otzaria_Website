import Ltr from '@/components/ui/Ltr'
import { versionParts } from '@/lib/adminPlugins/pluginTerms'

/** "גרסה 1.3.0 במקום 1.2.0" בעדכון, "1.0.6, באותה גרסה" בלי מספר חדש, "גרסה 1.0.0" בחדש — המספרים כ-LTR מבודדים, בלי חץ */
export default function PluginVersion({ plugin }) {
  const { next, prev, same } = versionParts(plugin)
  if (!next) return null
  return (
    <span className="whitespace-nowrap">
      גרסה <Ltr>{next}</Ltr>
      {prev && <> במקום <Ltr>{prev}</Ltr></>}
      {same && ', באותה גרסה'}
    </span>
  )
}
