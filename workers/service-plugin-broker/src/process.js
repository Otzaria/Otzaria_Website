import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

const IS_WINDOWS = process.platform === 'win32'
const activeChildren = new Set()

// משתנים שנדרשים לכל תהליך כדי לפעול; שום סוד אינו ביניהם.
const BASE_ENV_KEYS = IS_WINDOWS
  ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'TEMP', 'TMP', 'ComSpec']
  : ['PATH', 'LANG', 'LC_ALL', 'TZ']

/**
 * סביבה מפורשת ומינימלית לתהליך בן. `extra` מוסיף רק את מה שהכלי הספציפי צריך.
 * @param {Record<string,string|undefined|null>} extra
 */
export function buildChildEnv(extra = {}, parentEnv = process.env) {
  const env = {}
  for (const key of BASE_ENV_KEYS) {
    if (parentEnv[key]) env[key] = parentEnv[key]
  }
  if (!env.LANG && !IS_WINDOWS) env.LANG = 'C.UTF-8'
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== '') env[key] = String(value)
  }
  return env
}

/** מחליף {in} ו-{out} בעטיפת הבידוד בנתיבי ההפעלה הנוכחית. */
export function expandWrapper(wrapper, io = {}) {
  if (!wrapper?.length) return null
  return wrapper.map((part) => part.replace(/\{(in|out)\}/g, (_, key) => {
    if (typeof io[key] !== 'string' || !io[key]) throw new Error(`sandbox {${key}} has no value for this invocation`)
    return io[key]
  }))
}

/** POSIX: הבן הוא מנהיג קבוצת תהליכים (detached), והאות נשלח לקבוצה כולה גם אחרי שהמנהיג יצא. */
function signalTree(child, sig) {
  if (!IS_WINDOWS && child.pid) {
    try {
      process.kill(-child.pid, sig)
      return
    } catch (err) {
      if (err?.code === 'ESRCH') return
    }
  }
  try {
    child.kill(sig)
  } catch {
    /* כבר יצא */
  }
}

function groupAlive(child) {
  try {
    process.kill(-child.pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/** הורג את עץ התהליכים: SIGTERM ואחריו SIGKILL. */
export function killTree(child, graceMs = 10_000) {
  if (!child?.pid) return
  signalTree(child, 'SIGTERM')
  // לא מבוטל ביציאת המנהיג: צאצא באותה קבוצה שמתעלם מ-SIGTERM עדיין ייהרג.
  const t = setTimeout(() => signalTree(child, 'SIGKILL'), graceMs)
  t.unref?.()
}

export function killAllChildren(graceMs) {
  for (const child of activeChildren) killTree(child, graceMs)
}

/**
 * מריץ פקודה כמערך ארגומנטים, בלי shell.
 * @param {{bin:string, args?:string[]}} command
 * @param {string[]} args
 * @param {{cwd?:string, env?:object, signal?:AbortSignal, wrapper?:string[]|null, timeoutMs?:number,
 *   stallTimeoutMs?:number, killGraceMs?:number, captureStdout?:boolean, maxStdoutBytes?:number,
 *   maxStderrBytes?:number, onStdoutLine?:(line:string)=>boolean|void, stallOnStdoutLine?:boolean, onActivity?:()=>void,
 *   onSpawn?:(child)=>void}} opts
 */
export function runProcess(command, args, opts = {}) {
  const {
    cwd, env = buildChildEnv(), signal, wrapper = null, timeoutMs = 0, stallTimeoutMs = 0,
    killGraceMs = 10_000, captureStdout = true, maxStdoutBytes = 8 * 1024 * 1024,
    maxStderrBytes = 256 * 1024, onStdoutLine, stallOnStdoutLine = false, onActivity, onSpawn, closeGraceMs = 2000,
  } = opts
  const argv = [...(command.args ?? []), ...args]
  const [bin, finalArgs] = wrapper?.length
    ? [wrapper[0], [...wrapper.slice(1), command.bin, ...argv]]
    : [command.bin, argv]

  return new Promise((resolve) => {
    const out = { code: null, signal: null, stdout: '', stderr: '', stdoutTruncated: false, timedOut: false,
      stalled: false, aborted: false, spawnError: null }
    let child
    try {
      child = spawn(bin, finalArgs, {
        cwd, env, shell: false, windowsHide: true, detached: !IS_WINDOWS, stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      out.spawnError = err
      return resolve(out)
    }
    activeChildren.add(child)
    onSpawn?.(child)

    const stdoutChunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    const decoder = new StringDecoder('utf8')
    let lineBuf = ''
    let stallTimer = null
    let wallTimer = null
    let exitPoll = null

    const stop = (flag) => {
      out[flag] = true
      killTree(child, killGraceMs)
    }
    const armStall = () => {
      if (!stallTimeoutMs) return
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => stop('stalled'), stallTimeoutMs)
    }
    const activity = () => {
      armStall()
      onActivity?.()
    }
    armStall()
    if (timeoutMs) wallTimer = setTimeout(() => stop('timedOut'), timeoutMs)
    const onAbort = () => stop('aborted')
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', (chunk) => {
      if (!stallOnStdoutLine) activity()
      if (captureStdout) {
        if (stdoutBytes + chunk.length <= maxStdoutBytes) {
          stdoutChunks.push(chunk)
          stdoutBytes += chunk.length
        } else {
          out.stdoutTruncated = true
        }
      }
      if (onStdoutLine) {
        lineBuf += decoder.write(chunk)
        let idx
        while ((idx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.slice(0, idx).replace(/\r$/, '')
          lineBuf = lineBuf.slice(idx + 1)
          if (line && onStdoutLine(line) === true && stallOnStdoutLine) activity()
        }
      }
    })
    child.stderr.on('data', (chunk) => {
      if (!stallOnStdoutLine) activity()
      if (stderrBytes < maxStderrBytes) {
        out.stderr += chunk.subarray(0, maxStderrBytes - stderrBytes).toString('utf8')
        stderrBytes += chunk.length
      }
    })
    let done = false
    const finish = (code, sig) => {
      if (done) return
      done = true
      clearTimeout(stallTimer)
      clearTimeout(wallTimer)
      clearInterval(exitPoll)
      signal?.removeEventListener('abort', onAbort)
      activeChildren.delete(child)
      if (onStdoutLine) {
        const rest = (lineBuf + decoder.end()).trim()
        if (rest) onStdoutLine(rest)
      }
      out.code = code
      out.signal = sig
      if (captureStdout) out.stdout = Buffer.concat(stdoutChunks).toString('utf8')
      resolve(out)
    }
    child.on('error', (err) => {
      out.spawnError = err
      if (child.pid === undefined) finish(null, null)
    })
    child.on('close', finish)
    // צאצא שיצא מהקבוצה (setsid) ומחזיק את stdout מונע את 'close' — מסיימים כשהקבוצה ריקה.
    child.on('exit', (code, sig) => {
      const exitedAt = Date.now()
      exitPoll = setInterval(() => {
        const alive = IS_WINDOWS ? Date.now() - exitedAt < closeGraceMs : groupAlive(child)
        if (alive || done) return
        clearInterval(exitPoll)
        setTimeout(() => {
          if (done) return
          child.stdout.destroy()
          child.stderr.destroy()
          finish(code, sig)
        }, 500)
      }, 100)
    })
  })
}
