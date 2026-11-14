'use client'

import { useState, type FormEvent } from 'react'
import CheckboxField from '@/components/plugins/form/CheckboxField'
import FileDropZone from '@/components/plugins/form/FileDropZone'
import FormField from '@/components/plugins/form/FormField'
import FormNote from '@/components/plugins/form/FormNote'
import UploadStep from '@/components/plugins/upload/UploadStep'
import { readPluginManifest } from '@/components/plugins/upload/useUploadPluginForm'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { cx } from '@/components/ui/cx'
import { CHECKBOX, fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import { formatDateShort } from '@/lib/formatDate'
import { formatFileSize } from '@/lib/formatFileSize'
import {
  emptyInstallerRow,
  hasApprovedService,
  initialSubmissionForm,
  KIND_LABELS,
  resolveLimits,
  validateSubmissionForm,
  type InstallerRow,
  type ManageResponse,
  type SubmissionForm,
  type SubmissionKind
} from '../serviceSubmissionLogic'
import type { UploadTaskState } from '../useServiceSubmission'
import ServiceInstallerRowFields from './ServiceInstallerRowFields'
import ServiceRangeFields from './ServiceRangeFields'
import ServiceSourcesFields from './ServiceSourcesFields'
import SubmissionErrors from './SubmissionErrors'
import UploadProgressList from './UploadProgressList'

const PLUGIN_FILE_ID = 'service-plugin-file'

/**
 * טופס הגשה: שירות ותוסף (מתקינים לכל מערכת, גרסת שירות, הוראות הסרה) או עדכון תוסף בלבד. הבדיקה
 * המקדימה מציגה את כל השגיאות יחד; השליחה עצמה (טיוטה → קבצים → הקפאה) — אצל ההורה (onSubmit).
 */
export default function ServiceSubmissionForm({ manage, submitting, uploadTasks, serverErrors, onSubmit }: {
  manage: ManageResponse
  submitting: boolean
  uploadTasks: UploadTaskState[]
  serverErrors: string[]
  onSubmit: (form: SubmissionForm, pluginFile: File) => Promise<boolean>
}) {
  const limits = resolveLimits(manage.limits)
  const canPluginOnly = hasApprovedService(manage.current)
  const [form, setForm] = useState<SubmissionForm>(() => initialSubmissionForm(manage.current))
  const [pluginFile, setPluginFile] = useState<File | null>(null)
  const [manifest, setManifest] = useState<{ id: string; version: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [clientErrors, setClientErrors] = useState<string[]>([])

  const patch = (next: Partial<SubmissionForm>) => setForm((prev) => ({ ...prev, ...next }))
  const patchInstaller = (rowId: string, next: Partial<InstallerRow>) =>
    setForm((prev) => ({ ...prev, installers: prev.installers.map((r) => (r.rowId === rowId ? { ...r, ...next } : r)) }))

  const pickPluginFile = async (file: File | undefined) => {
    if (!file) return
    setPluginFile(file)
    setManifest(null)
    setFileError(null)
    try {
      const raw = await readPluginManifest(file)
      const id = typeof raw.id === 'string' ? raw.id.trim() : ''
      const version = typeof raw.version === 'string' ? raw.version.trim() : ''
      setManifest({ id, version })
      if (version) patch({ pluginVersion: version })
    } catch {
      setFileError('לא ניתן לקרוא את manifest.json מקובץ התוסף')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validateSubmissionForm(form, { pluginUid: manage.plugin.pluginUid, current: manage.current, limits, pluginFile, manifest })
    if (fileError) errors.unshift(fileError)
    setClientErrors(errors)
    if (errors.length > 0 || !pluginFile) return
    await onSubmit(form, pluginFile)
  }

  const isService = form.kind === 'service'
  const errors = clientErrors.length > 0 ? clientErrors : serverErrors

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6 md:space-y-8" aria-busy={submitting || undefined}>
      <UploadStep id="service-step-kind" step={1} title="סוג ההגשה">
        <fieldset>
          <legend className="sr-only">סוג ההגשה</legend>
          <div className="flex flex-col gap-2">
            {(['service', 'plugin'] as SubmissionKind[]).map((kind) => {
              const disabled = kind === 'plugin' && !canPluginOnly
              return (
                <label
                  key={kind}
                  htmlFor={`service-kind-${kind}`}
                  className={cx(
                    'flex min-h-(--touch-target) items-start gap-3 rounded-(--radius-control) border border-outline-variant bg-(--field-bg) p-4',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-selected'
                  )}
                >
                  <input
                    type="radio"
                    id={`service-kind-${kind}`}
                    name="service-kind"
                    checked={form.kind === kind}
                    disabled={disabled}
                    onChange={() => patch({ kind })}
                    className={CHECKBOX}
                    aria-describedby={`service-kind-${kind}-desc`}
                  />
                  <span className="min-w-0 flex-1 text-body-md text-on-surface">
                    {KIND_LABELS[kind]}
                    <span id={`service-kind-${kind}-desc`} className="mt-1 block text-body-sm text-on-surface-variant">
                      {kind === 'service'
                        ? 'גרסת שירות חדשה: כל המתקינים (שכוללים את התוסף) וקובץ התוסף. בדיקת שירות אפשרית אחת ל-21 יום.'
                        : canPluginOnly
                          ? 'גרסת תוסף חדשה מול השירות המאושר. אינה משנה מתקינים, פורטים או הוראות הסרה, ואינה כפופה ל-21 יום.'
                          : 'אפשרי רק אחרי שאושר שירות.'}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
        {isService && manage.cooldown.blocked && (
          <FormNote icon="schedule">
            בדיקת שירות חדשה אפשרית מ-{manage.cooldown.nextAllowedAt ? <Ltr>{formatDateShort(manage.cooldown.nextAllowedAt)}</Ltr> : 'המועד שייקבע'}.
            {' '}אפשר להגיש כבר עכשיו, אך הבדיקה תתחיל לפני המועד רק בחריגת מנהל חד-פעמית.
            {manage.adminException && ' אושרה חריגת מנהל להתחלה מוקדמת.'}
          </FormNote>
        )}
      </UploadStep>

      <UploadStep id="service-step-plugin" step={2} title="קובץ התוסף וגרסאות">
        <FileDropZone
          id={PLUGIN_FILE_ID}
          label="קובץ התוסף (.otzplugin)"
          icon="extension"
          required
          inputRequired={!pluginFile}
          accept=".otzplugin"
          onChange={(e) => void pickPluginFile(e.target.files?.[0])}
          onDropFiles={(files) => void pickPluginFile(files[0])}
          error={fileError}
          hint={<>אותו קובץ בדיוק שכלול בכל מתקין. מזהה התוסף חייב להיות <Ltr>{manage.plugin.pluginUid}</Ltr>; עד <Ltr>{formatFileSize(limits.pluginBytes)}</Ltr>.</>}
        >
          {pluginFile && (
            <p className="text-body-sm text-on-surface-variant">
              נבחר: <bdi dir="ltr" className="font-mono">{pluginFile.name}</bdi> (<Ltr>{formatFileSize(pluginFile.size)}</Ltr>)
              {manifest?.version ? <> · גרסה <Ltr>{manifest.version}</Ltr></> : null}
            </p>
          )}
        </FileDropZone>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="service-plugin-version" label="גרסת התוסף" required hint={manage.current?.pluginVersion ? `הנוכחית: ${manage.current.pluginVersion}` : 'נלקחת מקובץ התוסף'}>
            <input
              type="text"
              dir="ltr"
              value={form.pluginVersion}
              onChange={(e) => patch({ pluginVersion: e.target.value })}
              className={fieldClasses()}
              placeholder="1.0.0"
              {...fieldA11yProps('service-plugin-version', { required: true, hint: true })}
            />
          </FormField>
          {isService && (
            <FormField id="service-version" label="גרסת השירות" required hint={manage.current?.serviceVersion ? `הנוכחית: ${manage.current.serviceVersion}` : 'X.Y.Z — אחת לכל חבילת המערכות'}>
              <input
                type="text"
                dir="ltr"
                value={form.serviceVersion}
                onChange={(e) => patch({ serviceVersion: e.target.value })}
                className={fieldClasses()}
                placeholder="1.0.0"
                {...fieldA11yProps('service-version', { required: true, hint: true })}
              />
            </FormField>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-title-sm text-on-surface">גרסאות השירות שהתוסף עובד איתן</h3>
          <ServiceRangeFields
            min={form.rangeMin}
            max={form.rangeMax}
            noCeiling={form.noCeiling}
            onChange={(next) => patch(next)}
          />
        </div>
      </UploadStep>

      <UploadStep id="service-step-sources" step={3} title="קוד המקור">
        <FormNote icon="shield">
          מאגרים ציבוריים ב-GitHub שכוללים את קוד השירות, המתקין/המסיר והתוסף, כל אחד ב-commit מלא. מקור חסר או מוסתר
          {' '}יכול למנוע אישור. אל תכללו סיסמאות או מפתחות.
        </FormNote>
        <ServiceSourcesFields sources={form.sources} maxSources={limits.maxSources} onChange={(sources) => patch({ sources })} />
      </UploadStep>

      {isService && (
        <UploadStep id="service-step-installers" step={4} title="מתקינים">
          <FormNote icon="verified_user">
            <p>
              כל מתקין חייב להיבנות ב-GitHub Actions, על runner של GitHub (לא self-hosted), מתוך אחד המאגרים וה-commit
              {' '}שבהגשה, ולשאת אישור בנייה (<Ltr>actions/attest-build-provenance</Ltr>). חתימת קוד — לפני צעד האישור. אישור חסר
              {' '}או שאינו תואם לקובץ, למאגר או ל-commit — דחייה.
            </p>
            <p className="mt-1.5">
              התוסף מחולץ מכל מתקין סטטית ב-7-Zip, בלי להריץ אותו. מתקיני <strong>Inno Setup</strong> וחבילות <strong>WiX Burn</strong> אינם
              {' '}ניתנים לחילוץ ולכן ייעצרו — השתמשו ב-NSIS, ב-MSI או ב-ZIP.
            </p>
          </FormNote>
          {form.installers.map((row, index) => (
            <ServiceInstallerRowFields
              key={row.rowId}
              row={row}
              index={index}
              onChange={(next) => patchInstaller(row.rowId, next)}
              onRemove={form.installers.length > 1 ? () => patch({ installers: form.installers.filter((r) => r.rowId !== row.rowId) }) : undefined}
            />
          ))}
          <Button
            variant="outlined"
            size="sm"
            icon="add"
            disabled={form.installers.length >= limits.maxInstallers}
            onClick={() => patch({ installers: [...form.installers, emptyInstallerRow()] })}
          >
            הוספת מתקין
          </Button>
        </UploadStep>
      )}

      <UploadStep id="service-step-details" step={isService ? 5 : 4} title="פרטים נוספים">
        {isService && (
          <FormField id="service-uninstall" label="הוראות הסרת השירות" required hint="יוצגו בדף התוסף. הסרת התוסף מאוצריא אינה מסירה את השירות.">
            <textarea
              value={form.uninstall}
              onChange={(e) => patch({ uninstall: e.target.value })}
              className={fieldClasses({ kind: 'textarea' })}
              maxLength={limits.uninstallChars}
              {...fieldA11yProps('service-uninstall', { required: true, hint: true })}
            />
          </FormField>
        )}
        <FormField id="service-change-notes" label="מה השתנה" hint="לסוקר ולמנהל — בקצרה">
          <textarea
            value={form.changeNotes}
            onChange={(e) => patch({ changeNotes: e.target.value })}
            className={fieldClasses({ kind: 'textarea', className: 'min-h-24' })}
            maxLength={limits.changeNotesChars}
            {...fieldA11yProps('service-change-notes', { hint: true })}
          />
        </FormField>
        <CheckboxField
          id="service-vt-consent"
          checked={form.virusTotalConsent}
          onChange={(checked) => patch({ virusTotalConsent: checked })}
          label="אני מסכים/ה שקובצי ההפצה יישלחו לסריקה ב-VirusTotal"
          description="רק אם הסריקה מופעלת בשרת. הקבצים עשויים להיות משותפים עם שותפי האבטחה של VirusTotal — אל תכללו בהם סודות."
        />
      </UploadStep>

      <div className="space-y-4">
        <SubmissionErrors errors={errors} />
        <UploadProgressList tasks={uploadTasks} />
        <FormNote>
          סיום ההעלאה מקפיא את ההגשה ומעביר אותה ל״ממתין לבחירת מנהל״. אין שינוי של הגשה אחרי ההקפאה: לתיקון — מבטלים
          {' '}ומגישים מחדש.
        </FormNote>
        <Button type="submit" variant="filled" size="lg" icon="upload" loading={submitting} className="sm:min-w-60">
          {submitting ? 'מעלה...' : 'הגשה לבדיקה'}
        </Button>
      </div>
    </form>
  )
}
