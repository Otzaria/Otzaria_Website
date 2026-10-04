import { createHash } from 'node:crypto'
import { rowKey } from './csv.js'

export const BOOK_INFO_IDENTITY_PATH = 'ForDB/book_info_identity.json'
export const emptyIdentity = () => ({ schemaVersion: 1, events: [] })

/** The append-only ledger is read at exactly the same commit as the CSV. */
export function parseIdentity(text) {
  const ledger = JSON.parse(text)
  if (ledger?.schemaVersion !== 1 || Object.keys(ledger).sort().join(',') !== 'events,schemaVersion' || !Array.isArray(ledger.events)) throw new Error('Unsupported book identity ledger')
  const validKey = (key) => key && Object.keys(key).sort().join(',') === 'authorName,bookName' && typeof key.bookName === 'string' && key.bookName.length > 0 && typeof key.authorName === 'string' && key.bookName.isWellFormed() && key.authorName.isWellFormed() && !/[\r\u0000\ufeff]/.test(key.bookName + key.authorName)
  for (const [i, event] of ledger.events.entries()) {
    if (event?.id !== i + 1 || !['rename', 'remove'].includes(event.kind)) throw new Error('Invalid identity event/order')
    const required = ['id', 'kind', 'old', 'commit', event.kind === 'rename' ? 'new' : 'reason']
    if (required.some((key) => !(key in event)) || Object.keys(event).some((key) => ![...required, 'changeSetId'].includes(key))) throw new Error('Invalid identity event fields')
    if (!validKey(event.old) || (event.kind === 'rename' && !validKey(event.new))) throw new Error('Invalid identity key')
    if (event.changeSetId != null && (typeof event.changeSetId !== 'string' || !event.changeSetId)) throw new Error('Invalid change-set provenance')
    if (event.commit === null ? !event.changeSetId : typeof event.commit !== 'string' || !/^[0-9a-f]{40}$/.test(event.commit)) throw new Error('Invalid identity provenance')
    if (event.kind === 'remove' && (typeof event.reason !== 'string' || !event.reason)) throw new Error('Invalid identity removal reason')
  }
  return ledger
}

/** Replay only events newer than the submitted identity, including several missed cron runs. */
export function followIdentity(identity, ledger, revision) {
  if (!Number.isInteger(revision) || revision < 0 || revision > ledger.events.length) throw new Error('זהות ההצעה ישנה ולא אומתה; נדרשת בדיקה ידנית')
  let next = { ...identity }
  for (const event of ledger.events.slice(revision)) {
    if (rowKey(event.old.bookName, event.old.authorName) !== rowKey(next.bookName, next.authorName)) continue
    if (event.kind === 'remove') throw new Error('הספר הוסר אוטומטית מהספרייה; ההצעה נשמרה לבדיקה ידנית')
    next = { ...event.new }
  }
  return next
}

export function rebaseIdentities(ops, base) {
  return ops.map((op) => {
    // Pre-deployment operations have no ledger revision: only retain a still-existing exact identity.
    if (op.identityRevision == null) {
      if (!base.state.rows.has(rowKey(op.book, op.author))) throw new Error('זהות הצעה ישנה אינה בקובץ; נדרשת בדיקה ידנית')
      return { ...op, identityRevision: base.identity.events.length }
    }
    const next = followIdentity({ bookName: op.book, authorName: op.author }, base.identity, op.identityRevision)
    return { ...op, book: next.bookName, author: next.authorName, identityRevision: base.identity.events.length, baseRow: op.baseRow ? { ...op.baseRow, bookName: next.bookName, authorName: 'authorName' in op.changes ? op.baseRow.authorName : next.authorName } : op.baseRow }
  })
}

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
export function identityPrefixHash(ledger, revision = ledger.events.length) {
  return createHash('sha256').update(JSON.stringify(canonical(ledger.events.slice(0, revision)))).digest('hex')
}
export function assertIdentityPrefix(ledger, revision, hash) {
  if (revision > ledger.events.length || (hash && identityPrefixHash(ledger, revision) !== hash)) throw Object.assign(new Error('יומן שינויי הזהות שוכתב; נדרשת בדיקה ידנית'), { code: 'IDENTITY_REWRITE' })
}
