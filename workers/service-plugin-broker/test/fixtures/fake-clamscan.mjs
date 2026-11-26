import { load } from './fake-common.mjs'

const { scenario, args } = load()
const files = args.slice(args.indexOf('--') + 1)
const foundFiles = new Set()
// found: מחרוזת → חתימה על הקובץ האחרון; {file: אינדקס, sig} → חתימה על קובץ מסוים; {path, sig} → נתיב שרירותי.
for (const f of scenario.found ?? []) {
  const target = typeof f === 'string' ? files[files.length - 1] : f.path ?? files[f.file]
  foundFiles.add(target)
  process.stdout.write(`${target}: ${typeof f === 'string' ? f : f.sig} FOUND\n`)
}
for (const file of files) if (!foundFiles.has(file) && !scenario.omitOk) process.stdout.write(`${file}: OK\n`)
if (scenario.stdout) process.stdout.write(scenario.stdout)
if (scenario.stderr) process.stderr.write(scenario.stderr)
process.exit(scenario.exitCode ?? 0)
