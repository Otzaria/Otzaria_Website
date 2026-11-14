import { readdirSync, writeFileSync } from 'node:fs'
import { load } from './fake-common.mjs'

const { scenario } = load()
if (scenario.listing) writeFileSync(scenario.listing, JSON.stringify(readdirSync(process.cwd()).sort()))
const events = scenario.events ?? []
let i = 0
const next = () => {
  if (i < events.length) {
    process.stdout.write(JSON.stringify(events[i++]) + '\n')
    setTimeout(next, 5)
  } else if (scenario.silent) {
    setInterval(() => {
      if (scenario.noise) { process.stdout.write('CLI log\n{"type":"ping"}\n'); process.stderr.write('still alive\n') }
    }, 40)
  } else {
    process.exit(scenario.exitCode ?? 0)
  }
}
next()
