// מנהיג שיוצא ב-SIGTERM ונכד באותה קבוצה שמתעלם ממנו; רושם את ה-pid של הנכד.
import { spawn } from 'node:child_process'

const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' })
process.stdout.write(`${grandchild.pid}\n`)
setInterval(() => {}, 1000)
