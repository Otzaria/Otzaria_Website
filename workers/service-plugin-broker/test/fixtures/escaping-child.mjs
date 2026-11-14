// מפעיל נכד בקבוצה ובסשן משלו שמחזיק את stdout פתוח, ויוצא מיד.
import { spawn } from 'node:child_process'

const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] })
process.stdout.write(`${grandchild.pid}\n`)
grandchild.unref()
process.exit(0)
