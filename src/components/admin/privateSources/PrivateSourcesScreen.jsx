'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Button from '@/components/ui/Button'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import { errorToast } from '@/components/admin/list/adminRequest'
import StatusConfigModal from '@/components/status/StatusConfigModal'
import { DEFAULT_TAB, privateSourcesTabItems, settingsList, tabFromSearch, usageRows } from '@/lib/adminPrivateSourcesScreen/privateSourcesTerms'
import ManualSetsModal from './ManualSetsModal'
import OutreachEditModal from './OutreachEditModal'
import OutreachSection from './OutreachSection'
import SettingsSection from './SettingsSection'
import SourceEditModal from './SourceEditModal'
import SourcesSection from './SourcesSection'
import useOutreach from './useOutreach'
import usePrivateSources from './usePrivateSources'
import { adminScreenTitle } from '@/lib/adminNav'
import { withoutNextMarkers } from '@/components/admin/list/useUrlQuery'

const EMPTY = Object.freeze({})

/**
 * מסך "מקורות פרטיים" (/library/admin/private-sources): כותרת (⋮: סנכרן עם GitHub; בלשונית הפניות — "פנייה חדשה"),
 * ושלוש לשוניות — מקורות · פניות למכונים · הגדרות. הנתונים והבקשות — ב-usePrivateSources / useOutreach (כמו קודם);
 * חלונות העריכה הקיימים (מקור, פנייה, סטים, רשימות) נפתחים מכאן. מחיקה — ConfirmDialog; הודעות — בטוסט (התחברות
 * שפגה — עם "התחבר"). בזמן מחיקה (deleting) "מחק" בחלון ובשורה "כבויים", ומחיקה שנייה לא נשלחת. סנכרון שנכשל — טוסט.
 */
export default function PrivateSourcesScreen() {
  const { data: session } = useSession()
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const sources = usePrivateSources()
  const outreach = useOutreach()
  const [tab, setTab] = useState(DEFAULT_TAB)
  const [editingSource, setEditingSource] = useState(null)
  const [editingOutreach, setEditingOutreach] = useState(null) // רשומה, או 'new'
  const [settingsOpen, setSettingsOpen] = useState(null) // מזהה רשימה בהגדרות
  const [deleting, setDeleting] = useState(null) // מזהה הרשומה / הפנייה שנמחקת

  useEffect(() => {
    const fromUrl = tabFromSearch(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- הלשונית מהכתובת, אחרי ה-hydration
    if (fromUrl) setTab(fromUrl)
  }, [])

  const choose = (id) => {
    setTab(id)
    try {
      const q = new URLSearchParams(window.location.search)
      if (id === DEFAULT_TAB) q.delete('tab')
      else q.set('tab', id)
      const qs = q.toString()
      window.history.replaceState(withoutNextMarkers(window.history.state), '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    } catch {
      // סביבה בלי history — רק המצב המקומי
    }
  }

  const fail = (error) => toast.show(errorToast(error, 'הפעולה נכשלה. נסה שוב.'))

  const sync = async () => {
    if (sources.refreshing || sources.loading) return
    const result = await sources.load({ refresh: true })
    if (result.ok) toast.show({ message: 'הרשימה סונכרנה עם GitHub' })
    else toast.show(errorToast(result.error, 'הסנכרון עם GitHub נכשל. נסה שוב.'))
  }

  // ===== מקורות =====
  const saveSource = async (payload) => {
    try {
      await sources.saveSource(payload)
      setEditingSource(null)
      toast.show({ message: 'פרטי המקור נשמרו' })
    } catch (e) { fail(e) }
  }
  const deleteSource = async (item) => {
    if (deleting) return
    const ok = await confirm({
      title: 'למחוק את פרטי המקור?',
      body: `פרטי המקור של "${item.bookTitle || item.setName}" יימחקו. הספר עצמו ב-GitHub לא יושפע.`,
      confirmLabel: 'מחק',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(item.bookPath)
    try {
      await sources.deleteSource(item)
      setEditingSource(null)
      toast.show({ message: 'פרטי המקור נמחקו' })
    } catch (e) {
      fail(e)
    } finally {
      setDeleting(null)
    }
  }

  // ===== פניות =====
  const saveOutreach = async (payload) => {
    try {
      const data = await outreach.save(payload)
      if (data?.success) {
        setEditingOutreach(null)
        toast.show({ message: 'הפנייה נשמרה' })
      }
      return data
    } catch (e) {
      fail(e)
      return null
    }
  }
  const deleteOutreach = async (item) => {
    if (deleting) return
    const ok = await confirm({
      title: 'למחוק את הפנייה?',
      body: `הפנייה ל"${item.contactName || item.instituteName}" תימחק לצמיתות.`,
      confirmLabel: 'מחק פנייה',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(item._id)
    try {
      await outreach.remove(item)
      setEditingOutreach(null)
      toast.show({ message: 'הפנייה נמחקה' })
    } catch (e) {
      fail(e)
    } finally {
      setDeleting(null)
    }
  }

  // ===== הגדרות =====
  const list = settingsOpen ? settingsList(settingsOpen) : null
  const saveSettings = async (value) => {
    try {
      if (list.kind === 'sets') await sources.saveManualSets(list.configKey, value)
      else if (list.source === 'outreach') await outreach.saveStatuses(list.configKey, value)
      else await sources.saveOptionList(list.id, list.configKey, value)
      setSettingsOpen(null)
      toast.show({ message: `${list.title}: השינויים נשמרו` })
    } catch (e) { fail(e) }
  }

  const tabs = privateSourcesTabItems(sources.loading ? null : sources.stats, outreach.loading ? null : outreach.stats)

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        title={adminScreenTitle('private-sources')}
        description="מי מסר כל ספר בתיקיית MoreBooks (מור בוקס), ובאילו תנאים ניתן האישור לפרסום — ומי פנה לאיזה מכון."
        action={tab === 'outreach' ? <Button variant="filled" size="sm" icon="add" onClick={() => setEditingOutreach('new')}>פנייה חדשה</Button> : undefined}
        menuItems={[{ id: 'sync', icon: 'sync', label: sources.refreshing ? 'מסנכרן…' : 'סנכרן עם GitHub', disabled: sources.refreshing || sources.loading, onSelect: sync }]}
      />
      <Tabs label="לשוניות המקורות הפרטיים" idPrefix="private-sources" items={tabs} value={tab} onChange={choose} className="border-b border-outline-variant" />
      <div {...tabPanelProps('private-sources', tab)} className="outline-none">
        {tab === 'sources' && <SourcesSection sources={sources} onEdit={setEditingSource} onDeleteOrphan={deleteSource} deletingPath={deleting} />}
        {tab === 'outreach' && <OutreachSection outreach={outreach} onEdit={setEditingOutreach} onCreate={() => setEditingOutreach('new')} />}
        {tab === 'settings' && <SettingsSection sources={sources} outreach={outreach} onEdit={setSettingsOpen} />}
      </div>

      {editingSource && (
        <SourceEditModal item={editingSource} options={sources.options} onSave={saveSource} onDelete={() => deleteSource(editingSource)}
          deleting={Boolean(deleting)} onClose={() => setEditingSource(null)} />
      )}
      {editingOutreach && (
        <OutreachEditModal
          item={editingOutreach === 'new' ? null : editingOutreach}
          allItems={outreach.items}
          statuses={outreach.statuses}
          channels={outreach.channels}
          defaultOutreachBy={session?.user?.name || session?.user?.email || ''}
          onSave={saveOutreach}
          onDelete={() => editingOutreach !== 'new' && deleteOutreach(editingOutreach)}
          deleting={Boolean(deleting)}
          onClose={() => setEditingOutreach(null)}
        />
      )}
      {list?.kind === 'sets' && (
        <ManualSetsModal manualSets={sources.manualSets} books={sources.allBooks} onSave={saveSettings} onClose={() => setSettingsOpen(null)} />
      )}
      {list?.kind === 'statuses' && (
        <StatusConfigModal
          statuses={(list.source === 'outreach' ? outreach.statuses : sources.options[list.id]) || EMPTY}
          uploads={usageRows(list.id, { sourceItems: sources.items, outreachItems: outreach.items })}
          usageNoun={list.modal.usageNoun}
          defaultKey=""
          title={list.modal.title}
          itemNoun={list.modal.itemNoun}
          itemNounPlural={list.modal.itemNounPlural}
          existingTitle={list.modal.existingTitle}
          addTitle={list.modal.addTitle}
          assignedText={list.modal.assignedText}
          deleteConfirmBody={list.modal.deleteConfirmBody}
          deleteConfirmQuestion={list.modal.deleteConfirmQuestion}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(null)}
        />
      )}
      {confirmElement}
    </div>
  )
}
