import { load } from './fake-common.mjs'

const { scenario, args } = load()
const files = args.slice(args.indexOf('--') + 1)
for (const sig of scenario.found ?? []) process.stdout.write(`${files[files.length - 1]}: ${sig} FOUND\n`)
process.exit(scenario.exitCode ?? 0)
