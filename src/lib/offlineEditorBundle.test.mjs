import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { buildBundledComponents, buildAppSource, validateBundleReferences } = require('../../scripts/build-offline-editor.js')
const code = await buildBundledComponents()

test('בנדל האופליין כולל את רכיבי המודאלים המשותפים בלי הפניות חסרות', () => {
  assert.doesNotThrow(() => validateBundleReferences(code, buildAppSource()))
})

test('המודאלים באופליין מקבלים את הכפתור החדש והעורך הישן שומר את הכפתור שלו', () => {
  const components = vm.runInNewContext(`${code}\n({
    legacy: Button, modern: ModernButton,
    floating: Button$FloatingPanel, find: Button$FindReplaceDialog,
    shortcuts: Button$ShortcutsDialog, spellcheck: Button$SpellcheckDialog,
    unbound: Button$UnboundShortcutsNotice
  })`, { React, ...React, createPortal: () => null, Link: 'a' })
  assert.notEqual(components.legacy, components.modern)
  for (const key of ['floating', 'find', 'shortcuts', 'spellcheck', 'unbound']) {
    assert.equal(components[key], components.modern, key)
  }
  const modernHtml = renderToStaticMarkup(React.createElement(components.find, { variant: 'filled' }, 'חיפוש'))
  const legacyHtml = renderToStaticMarkup(React.createElement(components.legacy, { label: 'שמירה' }))
  assert.match(modernHtml, /חיפוש/)
  assert.match(legacyHtml, /שמירה/)
})
