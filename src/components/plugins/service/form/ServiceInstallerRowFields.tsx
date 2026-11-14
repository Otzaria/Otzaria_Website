'use client'

import FileDropZone from '@/components/plugins/form/FileDropZone'
import FormField from '@/components/plugins/form/FormField'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import { formatFileSize } from '@/lib/formatFileSize'
import { ARCH_LABELS, INSTALLER_ACCEPT, INSTALLER_EXTENSIONS, OS_LABELS, SERVICE_ARCH_IDS, SERVICE_OS_IDS, type ServiceArch, type ServiceOs } from '../servicePlatforms'
import type { InstallerRow } from '../serviceSubmissionLogic'

/**
 * מתקין אחד: הקובץ, מערכת ומעבד, מערכת מינימלית, פורט הזיהוי (אחד לכל מערכת), נתיב התוסף בתוך
 * המתקין וקישור ישיר לאותו קובץ ב-GitHub Release.
 */
export default function ServiceInstallerRowFields({ row, index, onChange, onRemove }: {
  row: InstallerRow
  index: number
  onChange: (patch: Partial<InstallerRow>) => void
  onRemove?: () => void
}) {
  const id = (field: string) => `service-installer-${row.rowId}-${field}`
  const pickFile = (files: FileList | null | undefined) => {
    const file = files?.[0]
    if (file) onChange({ file })
  }

  return (
    <fieldset className="space-y-4 rounded-(--radius-control) border border-outline-variant p-4">
      <legend className="px-1 text-label-lg text-on-surface">מתקין {index + 1}</legend>

      <FileDropZone
        id={id('file')}
        label="קובץ המתקין"
        icon="install_desktop"
        required
        inputRequired={!row.file}
        accept={INSTALLER_ACCEPT}
        onChange={(e) => pickFile(e.target.files)}
        onDropFiles={pickFile}
        hint={row.os ? <>סוגי קבצים ל-{OS_LABELS[row.os]}: <Ltr>{INSTALLER_EXTENSIONS[row.os].join(' ')}</Ltr></> : 'בחרו מערכת הפעלה כדי לראות את סוגי הקבצים המותרים'}
      >
        {row.file && (
          <p className="text-body-sm text-on-surface-variant">
            נבחר: <bdi dir="ltr" className="font-mono">{row.file.name}</bdi> (<Ltr>{formatFileSize(row.file.size)}</Ltr>)
          </p>
        )}
      </FileDropZone>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id('os')} label="מערכת הפעלה" required>
          <select
            value={row.os}
            onChange={(e) => onChange({ os: e.target.value as ServiceOs | '' })}
            className={fieldClasses({ kind: 'select' })}
            {...fieldA11yProps(id('os'), { required: true })}
          >
            <option value="">בחרו מערכת</option>
            {SERVICE_OS_IDS.map((os) => <option key={os} value={os}>{OS_LABELS[os]}</option>)}
          </select>
        </FormField>
        <FormField id={id('arch')} label="מעבד" required>
          <select
            value={row.arch}
            onChange={(e) => onChange({ arch: e.target.value as ServiceArch | '' })}
            className={fieldClasses({ kind: 'select' })}
            {...fieldA11yProps(id('arch'), { required: true })}
          >
            <option value="">בחרו מעבד</option>
            {SERVICE_ARCH_IDS.map((arch) => <option key={arch} value={arch}>{ARCH_LABELS[arch]}</option>)}
          </select>
        </FormField>
        <FormField id={id('min-os')} label="מערכת מינימלית" required hint="למשל Windows 10, macOS 12">
          <input
            type="text"
            value={row.minOs}
            onChange={(e) => onChange({ minOs: e.target.value })}
            className={fieldClasses()}
            maxLength={100}
            {...fieldA11yProps(id('min-os'), { required: true, hint: true })}
          />
        </FormField>
        <FormField id={id('port')} label="פורט הזיהוי" required hint="1024–65535; זהה לכל המתקינים של אותה מערכת">
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={row.port}
            onChange={(e) => onChange({ port: e.target.value })}
            className={fieldClasses()}
            placeholder="18090"
            {...fieldA11yProps(id('port'), { required: true, hint: true })}
          />
        </FormField>
      </div>

      <FormField id={id('bundled')} label="נתיב התוסף בתוך המתקין" required hint="נתיב יחסי לקובץ .otzplugin שהמתקין כולל">
        <input
          type="text"
          dir="ltr"
          value={row.bundledPluginPath}
          onChange={(e) => onChange({ bundledPluginPath: e.target.value })}
          className={fieldClasses({ className: 'font-mono' })}
          {...fieldA11yProps(id('bundled'), { required: true, hint: true })}
        />
      </FormField>

      <FormField id={id('release')} label="קישור לאותו קובץ ב-GitHub Release" required hint="https://github.com/OWNER/REPO/releases/download/TAG/FILE — ממאגר המקור שבהגשה">
        <input
          type="url"
          dir="ltr"
          value={row.releaseUrl}
          onChange={(e) => onChange({ releaseUrl: e.target.value })}
          className={fieldClasses()}
          {...fieldA11yProps(id('release'), { required: true, hint: true })}
        />
      </FormField>

      {onRemove && (
        <Button variant="text" size="sm" icon="delete" onClick={onRemove}>
          הסרת מתקין {index + 1}
        </Button>
      )}
    </fieldset>
  )
}
