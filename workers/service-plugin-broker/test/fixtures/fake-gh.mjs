import { readFileSync } from 'node:fs'
import { load } from './fake-common.mjs'

const { scenario } = load()
if (scenario.stderr) process.stderr.write(scenario.stderr)
if (scenario.stdoutFile) process.stdout.write(readFileSync(scenario.stdoutFile, 'utf8'))
process.exit(scenario.exitCode ?? 0)
