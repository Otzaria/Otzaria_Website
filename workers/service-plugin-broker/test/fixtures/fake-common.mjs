// עזר משותף לקובצי ההפעלה המזויפים: קורא תרחיש JSON ורושם את מה שקיבלו.
import { appendFileSync, readFileSync } from 'node:fs'

export function load() {
  const [scenarioFile, ...args] = process.argv.slice(2)
  const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8'))
  if (scenario.record) {
    appendFileSync(scenario.record, JSON.stringify({ args, cwd: process.cwd(), env: process.env }) + '\n')
  }
  return { scenario, args }
}
