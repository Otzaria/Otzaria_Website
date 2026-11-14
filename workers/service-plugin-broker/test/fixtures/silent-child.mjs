// מדפיס שורה אחת ואז שותק לנצח (עד שנהרג).
process.stdout.write('{"type":"system","subtype":"init","tools":["Read"],"mcp_servers":[]}\n')
setInterval(() => {}, 60_000)
