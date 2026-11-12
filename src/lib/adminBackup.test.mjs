import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BACKUP_URL, canDownloadBackup } from './adminBackup.js'

describe('גיבוי — מי רואה את "הורד גיבוי"', () => {
  it('לפי שם המשתמש admin בלבד — כמו לפני העיצוב החדש', () => {
    assert.equal(canDownloadBackup({ name: 'admin', role: 'admin' }), true)
    assert.equal(canDownloadBackup({ name: 'משה', role: 'admin' }), false)
    assert.equal(canDownloadBackup(null), false)
  })
  it('אותה נקודת קצה כמו קודם', () => {
    assert.equal(BACKUP_URL, '/api/admin/export-backup')
  })
})
