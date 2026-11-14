import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStrongWorkerSecret } from './policy.js'

export const BROKER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const AUTH_MODES = ['api_key', 'subscription']
export const UNSAFE_NO_SANDBOX = 'unsafe-none'

export class ConfigError extends Error {
  constructor(problems) {
    super(`תצורת המתווך שגויה:\n- ${problems.join('\n- ')}`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** פקודה מוגדרת כנתיב לקובץ ההפעלה בלבד — לא מפוצלת ולא עוברת ב-shell. */
const command = (value, fallback) => ({ bin: str(value) || fallback, args: [] })

/**
 * עטיפת בידוד: מערך JSON, או מילים מופרדות ברווח (ערך מהמפעיל בלבד, לא מקלט משתמש).
 * `{in}` ו-`{out}` מוחלפים בכל הפעלה בקלט ובתיקיית הפלט שלה בלבד.
 */
export function parseWrapper(value) {
  const raw = str(value)
  if (!raw || raw === UNSAFE_NO_SANDBOX) return null
  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || !arr.length || !arr.every((x) => typeof x === 'string' && x)) {
      throw new Error('SANDBOX_WRAPPER must be a non-empty JSON array of strings')
    }
    return arr
  }
  return raw.split(/\s+/)
}

const CREDENTIAL_NAMES = ['SERVICE_PLUGIN_WORKER_SECRET', 'GH_TOKEN', 'ANTHROPIC_API_KEY', 'VT_API_KEY']

/** סוד מ-`$CREDENTIALS_DIRECTORY/<name>` (systemd LoadCredential=) קודם, ואחר כך מהסביבה. */
export function readCredential(env, name, readFile = readFileSync) {
  const dir = str(env.CREDENTIALS_DIRECTORY)
  if (dir && path.isAbsolute(dir)) {
    try {
      return str(readFile(path.join(dir, name), 'utf8'))
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
  }
  return str(env[name])
}

export function loadConfig(env = process.env) {
  const problems = []
  const warnings = []

  const siteUrlRaw = str(env.SERVICE_BROKER_SITE_URL)
  let siteUrl = ''
  try {
    const u = new URL(siteUrlRaw)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('scheme')
    if (u.username || u.password || u.search || u.hash) throw new Error('extra')
    siteUrl = u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    problems.push('SERVICE_BROKER_SITE_URL חייב להיות כתובת https של האתר (http מותר רק ל-localhost)')
  }

  const cred = {}
  for (const name of CREDENTIAL_NAMES) {
    try {
      cred[name] = readCredential(env, name)
    } catch (err) {
      problems.push(`לא ניתן לקרוא את ${name} מ-CREDENTIALS_DIRECTORY: ${err?.code ?? err?.message}`)
      cred[name] = ''
    }
  }
  const workerSecret = cred.SERVICE_PLUGIN_WORKER_SECRET
  if (!isStrongWorkerSecret(workerSecret)) {
    problems.push('SERVICE_PLUGIN_WORKER_SECRET חסר או חלש (43–1024 תווי ASCII מודפסים, לפחות 8 שונים — כמו באתר)')
  }

  const dataDir = str(env.SERVICE_BROKER_DATA_DIR)
  if (!dataDir || !path.isAbsolute(dataDir)) problems.push('SERVICE_BROKER_DATA_DIR חייב להיות נתיב מוחלט')

  const claudeAuthMode = str(env.CLAUDE_AUTH_MODE)
  if (!AUTH_MODES.includes(claudeAuthMode)) {
    problems.push('CLAUDE_AUTH_MODE חובה: api_key או subscription (ראו README.he.md לפני הבחירה)')
  }
  const anthropicApiKey = cred.ANTHROPIC_API_KEY
  if (claudeAuthMode === 'api_key' && !anthropicApiKey) problems.push('CLAUDE_AUTH_MODE=api_key דורש ANTHROPIC_API_KEY')
  if (claudeAuthMode === 'subscription' && anthropicApiKey) {
    warnings.push('ANTHROPIC_API_KEY מוגדר אך CLAUDE_AUTH_MODE=subscription — המפתח לא יועבר ל-Claude')
  }

  const home = str(env.HOME) || os.homedir()

  const production = str(env.NODE_ENV) === 'production'
  const wrapperRaw = str(env.SANDBOX_WRAPPER)
  let sandboxWrapper = null
  try {
    sandboxWrapper = parseWrapper(wrapperRaw)
  } catch (err) {
    problems.push(`SANDBOX_WRAPPER לא תקין: ${err.message}`)
  }
  if (wrapperRaw === UNSAFE_NO_SANDBOX) {
    warnings.push('!!! SANDBOX_WRAPPER=unsafe-none: 7-Zip ו-ClamAV מפענחים קבצים עוינים ללא שום בידוד. אסור בשרת שבודק הגשות אמיתיות !!!')
  } else if (!wrapperRaw && production) {
    problems.push(`NODE_ENV=production דורש SANDBOX_WRAPPER (או ${UNSAFE_NO_SANDBOX} במפורש, על אחריות המפעיל)`)
  } else if (!wrapperRaw) {
    warnings.push('SANDBOX_WRAPPER לא הוגדר: 7-Zip ו-ClamAV ירוצו ללא בידוד רשת. בפרודקשן זה תנאי הפעלה.')
  } else if (sandboxWrapper && !(sandboxWrapper.some((x) => x.includes('{in}')) && sandboxWrapper.some((x) => x.includes('{out}')))) {
    warnings.push('SANDBOX_WRAPPER ללא {in}/{out}: כל הפעלה מקבלת את אותן הרשאות קבצים, ולא רק את הקלט והפלט שלה')
  }

  if (problems.length) throw new ConfigError(problems)

  return {
    siteUrl,
    workerSecret,
    brokerId: str(env.SERVICE_BROKER_ID) || `${os.hostname()}-${process.pid}`,
    dataDir: path.resolve(dataDir),
    claudeAuthMode,
    anthropicApiKey: claudeAuthMode === 'api_key' ? anthropicApiKey : '',
    claudeConfigDir: str(env.CLAUDE_CONFIG_DIR),
    home,
    claude: command(env.CLAUDE_BIN, 'claude'),
    clamscan: command(env.CLAMSCAN_BIN, 'clamscan'),
    sevenZip: command(env.SEVEN_ZIP_BIN, '7z'),
    gh: command(env.GH_BIN, 'gh'),
    ghToken: cred.GH_TOKEN,
    vtApiKey: cred.VT_API_KEY,
    production,
    sandboxWrapper,
    policyFile: path.join(BROKER_ROOT, 'policy', 'review-policy.he.md'),
    warnings,
  }
}

/**
 * במצב subscription נטען ~/.claude/settings.json של המשתמש הייעודי: hooks או הרשאות שמרחיבות את הבודק אסורים בו.
 * @returns {string[]} בעיות (ריק = תקין)
 */
export function checkClaudeUserSettings(config, readFile = readFileSync) {
  const file = path.join(config.claudeConfigDir || path.join(config.home, '.claude'), 'settings.json')
  let raw
  try {
    raw = readFile(file, 'utf8')
  } catch (err) {
    return err?.code === 'ENOENT' ? [] : [`לא ניתן לקרוא את ${file}: ${err?.code ?? err?.message}`]
  }
  let settings
  try {
    settings = JSON.parse(raw)
  } catch {
    return [`${file} אינו JSON תקין — לא ניתן לוודא שאין בו hooks או הרשאות`]
  }
  const nonEmpty = (v) => v !== undefined && v !== null && v !== false &&
    !(Array.isArray(v) ? !v.length : typeof v === 'object' && !Object.keys(v).length)
  const problems = []
  if (nonEmpty(settings?.hooks)) problems.push(`${file} מגדיר hooks`)
  if (nonEmpty(settings?.permissions?.allow)) problems.push(`${file} מגדיר permissions.allow`)
  if (nonEmpty(settings?.permissions?.additionalDirectories) || nonEmpty(settings?.additionalDirectories)) {
    problems.push(`${file} מגדיר additionalDirectories`)
  }
  return problems
}

/** כל ערך סודי שאסור שיופיע בדוח שנשלח למפתח. */
export function secretValues(config) {
  return [config.workerSecret, config.ghToken, config.vtApiKey, config.anthropicApiKey].filter((s) => s && s.length >= 8)
}
