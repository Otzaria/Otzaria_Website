import { appendFileSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { load } from './fake-common.mjs'

const { scenario, args } = load()
if (scenario.exitCode) process.exit(scenario.exitCode)
const archive = args[args.indexOf('--') + 1]
const byName = scenario.byName?.[path.basename(archive)]
if (scenario.byName && !byName) process.exit(2)
const entries = byName ?? scenario.entries
if (args[0] === 'l') {
  const out = ['7-Zip (fake)', '', `Listing archive: ${archive}`, '', '--', `Path = ${archive}`, `Type = ${scenario.type ?? 'zip'}`, '', '----------']
  for (const e of entries) {
    out.push(`Path = ${e.path}`, `Folder = ${e.dir ? '+' : '-'}`, `Size = ${e.size ?? 0}`, `Attributes = ${e.dir ? 'D' : 'A'}`, '')
  }
  process.stdout.write(out.join('\n') + '\n')
} else if (args[0] === 'x' && scenario.inflate) {
  // gzip עם ISIZE מזויף: הרשימה מצהירה על גודל קטן, והחילוץ כותב הרבה יותר.
  const outDir = args.find((a) => a.startsWith('-o')).slice(2)
  mkdirSync(outDir, { recursive: true })
  const chunk = Buffer.alloc(scenario.inflate.chunk, 0x41)
  let written = 0
  const t = setInterval(() => {
    appendFileSync(path.join(outDir, 'bomb'), chunk)
    written += chunk.length
    if (written >= scenario.inflate.total) {
      clearInterval(t)
      process.exit(0)
    }
  }, 10)
} else if (args[0] === 'x') {
  const outDir = args.find((a) => a.startsWith('-o')).slice(2)
  for (const e of entries) {
    const target = path.join(outDir, ...e.path.split('/'))
    if (e.dir) mkdirSync(target, { recursive: true })
    else {
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(e.from, target)
    }
  }
}
