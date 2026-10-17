import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectIconNames,
  filterKnown,
  iconNamesInSource,
  iconNamesParamLength,
  ICON_NAMES_MAX_CHARS,
} from './iconFontScan.mjs'

const names = (src) => [...iconNamesInSource(src)].sort()

test('טקסט בתוך אלמנט material-symbols-outlined, גם בכמה שורות', () => {
  assert.deepEqual(names('<span className="material-symbols-outlined text-sm">close</span>'), ['close'])
  assert.deepEqual(
    names(`<span
      className="material-symbols-outlined"
      aria-hidden="true"
    >
      drag_indicator
    </span>`),
    ['drag_indicator']
  )
})

test('מחרוזות בביטוי הילד של אלמנט אייקון (טרנרי, ברירת מחדל)', () => {
  assert.deepEqual(
    names(`<span className="material-symbols-outlined">{open ? 'expand_less' : 'expand_more'}</span>`),
    ['expand_less', 'expand_more']
  )
  assert.deepEqual(names('<span className="material-symbols-outlined">{category.icon || \'extension\'}</span>'), ['extension'])
})

test('className עם ביטוי שמכיל > אינו קוטע את תגית הפתיחה', () => {
  const src = '<span className={`material-symbols-outlined ${n > 1 ? "a" : "b"}`}>check</span>'
  assert.deepEqual(names(src), ['check'])
})

test('AppIcon: name כמחרוזת או כביטוי', () => {
  assert.deepEqual(names('<AppIcon name="search" className="x" />'), ['search'])
  assert.deepEqual(names("<AppIcon name={busy ? 'hourglass_top' : 'save'} />"), ['hourglass_top', 'save'])
})

test('שדות ו-props שבשמם icon', () => {
  assert.deepEqual(names("const items = [{ icon: 'home', label: 'בית' }, { icon: \"info\" }]"), ['home', 'info'])
  assert.deepEqual(names('<Button iconEnd="open_in_new" title="title">x</Button>'), ['open_in_new'])
  assert.deepEqual(names("<IconTile icon={editMode ? 'visibility' : 'edit'} />"), ['edit', 'visibility'])
  assert.deepEqual(names("function Card({ icon = 'help', title }) {}"), ['help'])
  assert.deepEqual(names('{ "icon": "star" }'), ['star'])
})

test('טרנרי שנפרש על כמה שורות', () => {
  const src = `const x = {
    icon: done
      ? 'check_circle'
      : 'pending',
    label: 'none_of_these',
  }`
  assert.deepEqual(names(src), ['check_circle', 'pending'])
})

test('מילון ופונקציה שבשמם icon', () => {
  const src = `
const PAGE_ICONS = {
  'getting-started': 'rocket_launch',
  library: 'local_library',
}
export function iconForSlug(slug) {
  return PAGE_ICONS[slug] || 'menu_book'
}
const getIcon = () => {
  switch (view) {
    case 'list': return 'list_alt'
    default: return 'find_replace'
  }
}
const other = 'image'`
  // 'getting-started' אינו בצורת שם; 'list' נאסף (ערך case) ומסונן אחר כך מול רשימת השמות
  assert.deepEqual(names(src), ['find_replace', 'list', 'list_alt', 'local_library', 'menu_book', 'rocket_launch'])
})

test('קריאה לפונקציה שבשמה icon', () => {
  assert.deepEqual(names("{icon('edit')} {renderIcon(\"delete\", 'text-sm')}"), ['delete', 'edit'])
})

test('פרמטר מיקומי בשם icon: נאסף הארגומנט במקום המתאים בלבד', () => {
  const src = `
const toolButton = (tool, icon, label, title = label) => (
  <button><span className="material-symbols-outlined">{icon}</span>{label}</button>
)
{toolButton('cleanText', 'cleaning_services', 'ניקוי טקסט')}
{toolButton('embedImage', 'image', 'הטמעת תמונה')}`
  assert.deepEqual(names(src), ['cleaning_services', 'image'])
})

test('מחרוזות מחוץ להקשר אייקון אינן נאספות', () => {
  const src = `
// icon: 'from_comment' — הערה
function map(items) { return items.filter((x) => x.type === 'image') }
const style = { height: 'auto', class: 'start' }
const msg = "it's fine"
<span className="text-sm">close</span>`
  assert.deepEqual(names(src), [])
})

test('collectIconNames שומר את הקובץ הראשון לכל שם', () => {
  const found = collectIconNames([
    { file: 'a.jsx', text: "<AppIcon name='home' />" },
    { file: 'b.jsx', text: "const x = { icon: 'home' }; const y = { icon: 'menu' }" },
  ])
  assert.deepEqual([...found], [['home', 'a.jsx'], ['menu', 'b.jsx']])
})

test('filterKnown מפצל לפי רשימת השמות התקפים וממיין', () => {
  const universe = new Set(['home', 'menu', 'list'])
  assert.deepEqual(filterKnown(['menu', 'none', 'home', 'true'], universe), {
    known: ['home', 'menu'],
    unknown: ['none', 'true'],
  })
})

test('אורך icon_names והמגבלה של Google', () => {
  assert.equal(iconNamesParamLength(['a', 'bc']), 4)
  assert.equal(ICON_NAMES_MAX_CHARS, 4096)
})
