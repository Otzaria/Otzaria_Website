// פעיל כל הזמן (stdout ו-stderr לסירוגין) ויוצא אחרי משך שהועבר כארגומנט.
const total = Number(process.argv[2] ?? 600)
let i = 0
const t = setInterval(() => {
  if (i++ % 2) process.stdout.write(`{"tick":${i}}\n`)
  else process.stderr.write('.')
}, 40)
setTimeout(() => {
  clearInterval(t)
  process.exit(0)
}, total)
