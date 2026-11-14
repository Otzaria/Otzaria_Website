import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { abortReason } from './errors.js'

export const OBJECT_ID_RE = /^[a-f0-9]{24}$/

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortReason(signal))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

export async function sha256File(file) {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
    size += chunk.length
  }
  return { sha256: hash.digest('hex'), size }
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o750 })
  return dir
}

export async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function removeDir(dir) {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 })
}

/** מצרף רכיבים לשורש ומוודא שהתוצאה נשארת בתוכו. */
export function safeJoin(root, ...parts) {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...parts)
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error('path escapes root')
  }
  return target
}

const cp = (n) => String.fromCharCode(n)
// בקרה (C0/C1), כיווניות, מפרידי שורה ותווים ברוחב אפס — כולם יכולים לזייף שורה או להסתיר תוכן.
const INVISIBLE = `${cp(0x7f)}-${cp(0x9f)}${cp(0x061c)}${cp(0x200b)}-${cp(0x200f)}${cp(0x2028)}-${cp(0x202e)}${cp(0x2060)}-${cp(0x2069)}${cp(0xfeff)}`
const UNSAFE_LIST_CHARS = new RegExp(`[${cp(0)}-${cp(0x1f)}${INVISIBLE}\\\\]`, 'g')
const UNSAFE_CONTENT_CHARS = new RegExp(`[${cp(0)}-${cp(8)}${cp(0x0a)}-${cp(0x1f)}${INVISIBLE}]`, 'g')
const visible = (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`

/** תווי בקרה ותווי כיווניות מוחלפים בייצוג גלוי — שמות מהמאגר אינם יכולים לזייף שורות. */
export function escapeForList(value) {
  return String(value).replace(UNSAFE_LIST_CHARS, (c) => (c === '\\' ? '\\\\' : visible(c)))
}

/** כמו escapeForList לשורת תוכן: טאב נשמר ולוכסן הפוך אינו מוכפל. */
export function neutralizeContentLine(value) {
  return String(value).replace(UNSAFE_CONTENT_CHARS, visible)
}

export const CLAUDE_CONFIG_NAMES = Object.freeze(['CLAUDE.md', 'CLAUDE.local.md', '.claude', '.mcp.json'])

/** קובצי הגדרות של Claude בתיקייה או באחת מתיקיות האב שלה — הם נטענים לבודק. */
export async function findAncestorClaudeConfig(dir) {
  const found = []
  let cur = path.resolve(dir)
  for (;;) {
    for (const name of CLAUDE_CONFIG_NAMES) {
      if (await exists(path.join(cur, name))) found.push(path.join(cur, name))
    }
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return found
}

export function retryDelay(attempt, base = 2000, cap = 60_000) {
  return Math.min(cap, base * 2 ** Math.min(attempt, 10))
}

export function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${n} B`
}
