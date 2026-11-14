'use client'

import FormField from '@/components/plugins/form/FormField'
import Button from '@/components/ui/Button'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import { emptySourceRow, type SourceRow } from '../serviceSubmissionLogic'

/** מאגרי המקור הציבוריים (owner/repository) וה-commit המלא של כל אחד — עד maxSources */
export default function ServiceSourcesFields({ sources, maxSources, onChange }: {
  sources: SourceRow[]
  maxSources: number
  onChange: (sources: SourceRow[]) => void
}) {
  const update = (rowId: string, patch: Partial<SourceRow>) =>
    onChange(sources.map((s) => (s.rowId === rowId ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-4">
      {sources.map((source, index) => {
        const repoId = `service-source-${source.rowId}-repo`
        const commitId = `service-source-${source.rowId}-commit`
        return (
          <fieldset key={source.rowId} className="rounded-(--radius-control) border border-outline-variant p-4">
            <legend className="px-1 text-label-lg text-on-surface">מקור {index + 1}</legend>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <FormField id={repoId} label="מאגר GitHub" required hint="owner/repository">
                <input
                  type="text"
                  dir="ltr"
                  value={source.repository}
                  onChange={(e) => update(source.rowId, { repository: e.target.value })}
                  className={fieldClasses()}
                  placeholder="OWNER/REPO"
                  {...fieldA11yProps(repoId, { required: true, hint: true })}
                />
              </FormField>
              <FormField id={commitId} label="commit מלא" required hint="40 תווים הקסדצימליים">
                <input
                  type="text"
                  dir="ltr"
                  value={source.commit}
                  onChange={(e) => update(source.rowId, { commit: e.target.value })}
                  className={fieldClasses({ className: 'font-mono' })}
                  maxLength={40}
                  spellCheck={false}
                  {...fieldA11yProps(commitId, { required: true, hint: true })}
                />
              </FormField>
            </div>
            {sources.length > 1 && (
              <Button variant="text" size="sm" icon="delete" className="mt-2" onClick={() => onChange(sources.filter((s) => s.rowId !== source.rowId))}>
                הסרת מקור {index + 1}
              </Button>
            )}
          </fieldset>
        )
      })}
      <Button
        variant="outlined"
        size="sm"
        icon="add"
        disabled={sources.length >= maxSources}
        onClick={() => onChange([...sources, emptySourceRow()])}
      >
        הוספת מקור
      </Button>
    </div>
  )
}
