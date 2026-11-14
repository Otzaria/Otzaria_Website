// עטיפת בידוד מזויפת: רושמת את הארגומנטים שלה (עד '--') ומריצה את הפקודה שאחריהם.
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const [record, ...rest] = process.argv.slice(2)
const sep = rest.indexOf('--')
appendFileSync(record, JSON.stringify(rest.slice(0, sep)) + '\n')
const [bin, ...args] = rest.slice(sep + 1)
const r = spawnSync(bin, args, { stdio: 'inherit' })
process.exit(r.status ?? 1)
