'use client'

import { useId, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Loader from '@/components/ui/Loader'
import SelectMenu from '@/components/ui/SelectMenu'
import { fieldClasses } from '@/components/ui/fieldStyles'
import { formatNumber } from '@/lib/adminTerms'
import {
  DEFAULT_HOME_SUBTITLE, DEFAULT_HOME_TITLE, FEATURED_SOFT_LIMIT, movedNotice, visibleInCategory,
} from '@/lib/adminPlugins/storeLayout'
import { downloadsText } from '@/lib/adminPlugins/pluginTerms'
import OrderedPluginList, { ReorderButtons, useDragReorder } from './OrderedPluginList'
import PluginThumb from './PluginThumb'
import { useReorderFocus } from './useReorderFocus'

/** כמה תוספים לא משובצים מוצגים בכל פעם — בחנות גדולה הרשימה הייתה מתארכת לעשרות מסכים */
export const UNPLACED_PAGE = 50

function SectionHead({ id, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-title-lg text-on-surface">{title}</h2>
        {description && <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** כותרת דף הבית ושורת המשנה — נשמרות באותו "שמור שינויים" של הנבחרים */
export function HomeTextSection({ title, subtitle, onTitle, onSubtitle }) {
  const ids = { head: useId(), title: useId(), subtitle: useId() }
  return (
    <Card as="section" aria-labelledby={ids.head} padding="md" className="flex flex-col gap-4">
      <SectionHead id={ids.head} title="כותרות דף הבית" description="שדה ריק — מוצג הטקסט שבתוכו." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.title} className="text-label-lg text-on-surface">כותרת דף הבית</label>
          <input id={ids.title} value={title} onChange={(e) => onTitle(e.target.value)} placeholder={DEFAULT_HOME_TITLE} className={fieldClasses()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.subtitle} className="text-label-lg text-on-surface">שורת משנה</label>
          <input id={ids.subtitle} value={subtitle} onChange={(e) => onSubtitle(e.target.value)} placeholder={DEFAULT_HOME_SUBTITLE} className={fieldClasses()} />
        </div>
      </div>
    </Card>
  )
}

/** "הוסף לנבחרים" מושבת כשרשימת התוספים לא זמינה — כאן אומרים למה (title לא נראה בטלפון) */
function ApprovedNote({ failed, onRetry }) {
  if (failed) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
        לא הצלחנו לטעון את רשימת התוספים, ולכן אי אפשר להוסיף כרגע.
        <Button variant="text" size="sm" icon="refresh" onClick={onRetry}>נסה שוב</Button>
      </p>
    )
  }
  return <p className="text-body-sm text-on-surface-variant">טוען את רשימת התוספים…</p>
}

/** הנבחרים שבראש דף הבית. הסדר נשמר רק ב"שמור שינויים" */
export function FeaturedSection({ items, onChange, options, disabled, optionsReady, optionsFailed, onRetryOptions }) {
  const id = useId()
  return (
    <Card as="section" aria-labelledby={id} padding="md" className="flex flex-col gap-4">
      <SectionHead id={id} title="נבחרים" description="התוספים שבראש דף הבית, בסדר הזה. גרור או השתמש בחצים. נשמר רק ב״שמור שינויים״." />
      {items.length > FEATURED_SOFT_LIMIT && (
        <p className="text-body-sm text-on-surface-variant">כדאי עד {FEATURED_SOFT_LIMIT} נבחרים. עכשיו יש {items.length}.</p>
      )}
      <OrderedPluginList
        items={items}
        onChange={onChange}
        options={options}
        label="התוספים הנבחרים, לפי הסדר"
        addLabel="הוסף לנבחרים"
        emptyText="אין נבחרים — האזור הזה לא יוצג בדף הבית."
        disabled={disabled}
      />
      {!optionsReady && <ApprovedNote failed={optionsFailed} onRetry={onRetryOptions} />}
    </Card>
  )
}

function CategoryRow({ category, index, count, drag, reordering, onMove, onEdit }) {
  return (
    <li {...drag} data-reorder-row={category.id} className={`flex min-h-16 items-center gap-1 px-1 sm:px-2 ${drag.className}`}>
      <AppIcon name="drag_indicator" className="shrink-0 text-icon-lg text-on-surface-variant max-sm:hidden" />
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) bg-secondary-container text-on-secondary-container">
        {reordering === category.id ? <Loader size="inline" decorative className="text-icon-lg" /> : <AppIcon name={category.icon || 'category'} className="text-icon-lg" />}
      </span>
      <span className="min-w-0 flex-1 px-2 py-2">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 text-title-sm text-on-surface [overflow-wrap:anywhere]">{category.name}</span>
          {!category.isVisible && <Badge icon="visibility_off">מוסתרת</Badge>}
          {category.showOnHome && <Badge tone="primary">בדף הבית</Badge>}
        </span>
        <span className="block text-body-sm text-on-surface-variant tabular-nums">
          {formatNumber(category.plugins.length)} משובצים · {formatNumber(visibleInCategory(category))} מוצגים · {category.sortMode === 'rating' ? 'לפי הדירוג' : 'סדר קבוע'}
        </span>
      </span>
      <ReorderButtons name={category.name} index={index} count={count} busy={reordering !== null} onMove={onMove} />
      <Button variant="text" size="sm" onClick={onEdit} aria-label={`ערוך את ${category.name}`}>ערוך</Button>
    </li>
  )
}

/** הקטגוריות: הסדר נשמר מיד; עריכה — במגירה */
export function CategoriesSection({ categories, reordering, onMove, onEdit, onCreate }) {
  const id = useId()
  const { rootRef, notice, announce } = useReorderFocus()
  const move = async (category, target, { keyboard = false } = {}) => {
    const up = target < categories.findIndex((c) => c.id === category.id)
    if (await onMove(category, target)) {
      announce(movedNotice(category.name, target, categories.length), keyboard ? { id: category.id, control: up ? 'up' : 'down', fallback: up ? 'down' : 'up' } : null)
    }
  }
  const dnd = useDragReorder((from, to) => { if (!reordering) move(categories[from], to) })

  return (
    <Card as="section" aria-labelledby={id} padding="md" className="flex flex-col gap-4">
      <SectionHead
        id={id}
        title="קטגוריות"
        description="הסדר נשמר מיד. תוסף יכול להיות בכמה קטגוריות."
        action={<Button variant="tonal" size="sm" icon="add" data-new-category="" onClick={onCreate}>קטגוריה חדשה</Button>}
      />
      <p role="status" className="sr-only">{notice}</p>
      <div ref={rootRef} tabIndex={-1} className="outline-none">
        {categories.length === 0 ? (
          <EmptyState tone="plain" icon="category" title="עדיין אין קטגוריות" as="h3" />
        ) : (
          <ol aria-label="הקטגוריות, לפי הסדר" className="flex flex-col divide-y divide-outline-variant/60 overflow-hidden rounded-(--radius-control) bg-background">
            {categories.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                index={index}
                count={categories.length}
                drag={dnd(index)}
                reordering={reordering}
                onMove={(direction) => move(category, index + direction, { keyboard: true })}
                onEdit={() => onEdit(category)}
              />
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

function UnplacedRow({ plugin, categoryOptions, featureBlocked, busy, onFeature, onAssign }) {
  return (
    <li className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2">
      <PluginThumb plugin={{ _id: plugin.id }} hasImage={Boolean(plugin.image)} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-title-sm text-on-surface">
          {plugin.name}
          {plugin.isFeatured && <Badge tone="primary" icon="star">נבחר</Badge>}
        </span>
        <span className="block text-body-sm text-on-surface-variant tabular-nums">{downloadsText(plugin.downloadCount)}</span>
      </span>
      <span className="flex items-center gap-1">
        {!plugin.isFeatured && (
          <Button variant="text" size="sm" icon="star" onClick={() => onFeature(plugin)} disabled={busy || featureBlocked} aria-label={`הוסף לנבחרים: ${plugin.name}`}>
            הוסף לנבחרים
          </Button>
        )}
        <SelectMenu
          variant="action"
          label={`שבץ את ${plugin.name} בקטגוריה`}
          triggerText="שבץ"
          icon="category"
          options={categoryOptions}
          value={null}
          disabled={busy || categoryOptions.length === 0}
          onChange={(id) => onAssign(plugin, id)}
        />
      </span>
    </li>
  )
}

/** תוספים שאינם באף קטגוריה. "הוסף לנבחרים" דורש שמירה קודם; "שבץ" דורש קטגוריה — בשני המקרים זה כתוב */
export function UnplacedSection({ plugins, categories, dirty, working, onFeature, onAssign }) {
  const id = useId()
  const [shown, setShown] = useState(UNPLACED_PAGE)
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.isVisible ? c.name : `${c.name} (מוסתרת)` }))
  const rest = plugins.length - shown

  return (
    <Card as="section" aria-labelledby={id} padding="md" className="flex flex-col gap-4">
      <SectionHead
        id={id}
        title={`לא משובצים${plugins.length > 0 ? ` (${formatNumber(plugins.length)})` : ''}`}
        description="תוספים שאינם באף קטגוריה. זה תקין — הם עדיין בחנות. הרשימה כאן רק עוזרת לסדר."
      />
      {plugins.length === 0 ? (
        <EmptyState tone="plain" icon="task_alt" title="כל התוספים משובצים" as="h3" />
      ) : (
        <>
          {dirty && <p className="text-body-sm text-on-surface-variant">כדי להוסיף מכאן לנבחרים, קודם שמור את השינויים.</p>}
          {categories.length === 0 && <p className="text-body-sm text-on-surface-variant">כדי לשבץ תוסף, קודם צור קטגוריה.</p>}
          <ul className="flex flex-col divide-y divide-outline-variant/60 overflow-hidden rounded-(--radius-control) bg-background">
            {plugins.slice(0, shown).map((plugin) => (
              <UnplacedRow
                key={plugin.id}
                plugin={plugin}
                categoryOptions={categoryOptions}
                featureBlocked={dirty}
                busy={working !== null}
                onFeature={onFeature}
                onAssign={onAssign}
              />
            ))}
          </ul>
          {rest > 0 && (
            <Button variant="text" size="sm" className="self-center" onClick={() => setShown((n) => n + UNPLACED_PAGE)}>
              הצג עוד ({formatNumber(rest)})
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
