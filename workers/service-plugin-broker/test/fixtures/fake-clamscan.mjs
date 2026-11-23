import { load } from './fake-common.mjs'

const { scenario, args } = load()
const files = args.slice(args.indexOf('--') + 1)
// found: מחרוזת → חתימה על הקובץ האחרון; {file: אינדקס, sig} → חתימה על קובץ מסוים; {path, sig} → נתיב שרירותי.
for (const f of scenario.found ?? []) {
  const target = typeof f === 'string' ? files[files.length - 1] : f.path ?? files[f.file]
  process.stdout.write(`${target}: ${typeof f === 'string' ? f : f.sig} FOUND\n`)
}
process.exit(scenario.exitCode ?? 0)
