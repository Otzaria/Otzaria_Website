import { WorkerApi } from './api.js'
import { Broker } from './broker.js'
import { codeFingerprint } from './codeVersion.js'
import { ConfigError, checkClaudeUserSettings, loadConfig } from './config.js'
import { ensureDir, findAncestorClaudeConfig } from './util.js'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// יציאה לא-אפסית ש-systemd (Restart=on-failure) מפעיל אחריה מחדש, עם הקוד החדש.
const RESTART_EXIT_CODE = 75

function log(event, data = {}) {
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n')
}

async function main() {
  let config
  try {
    config = loadConfig(process.env)
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`)
      process.exit(78)
    }
    throw err
  }
  for (const w of config.warnings) log('config_warning', { message: w })
  if (config.claudeAuthMode === 'subscription') {
    const problems = checkClaudeUserSettings(config)
    if (problems.length) {
      process.stderr.write(`הגדרות Claude של משתמש המתווך מרחיבות את הבודק ואסורות:\n- ${problems.join('\n- ')}\n`)
      process.exit(78)
    }
  }
  await ensureDir(path.join(config.dataDir, 'jobs'))
  await ensureDir(path.join(config.dataDir, 'snapshots'))
  await mkdir(path.join(config.dataDir, 'private'), { recursive: true, mode: 0o700 })
  const stray = await findAncestorClaudeConfig(path.join(config.dataDir, 'private'))
  if (stray.length) {
    process.stderr.write(`קובצי הגדרות של Claude נמצאו מעל תיקיית הנתונים ויטענו לבודק: ${stray.join(', ')}\n`)
    process.exit(78)
  }

  const api = new WorkerApi({ siteUrl: config.siteUrl, workerSecret: config.workerSecret, workerId: config.brokerId })
  const broker = new Broker({ config, api, log, codeFingerprint })
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => broker.stop(sig))
  log('started', { brokerId: config.brokerId, authMode: config.claudeAuthMode, sandbox: Boolean(config.sandboxWrapper),
    virusTotal: Boolean(config.vtApiKey) })
  await broker.run()
  if (broker.restartRequested) process.exit(RESTART_EXIT_CODE)
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`)
  process.exit(1)
})
