// Temporary dependency repair for the confirmed ReDoS in validator 1.18/1.19.
// Run after every install, including the deploy's refresh of the moving v1 tag.
// Refuse unfamiliar scanner code rather than silently losing this protection.
const fs = require('node:fs')
const path = require('node:path')

const target = path.join(path.dirname(require.resolve('otzaria-plugin-validator')), 'extendedValidator.js')
const vulnerable = String.raw`|[^/\\\n\r]`
const fixed = String.raw`|[^/\\[\n\r]`
const upstreamFixed = String.raw`|[^/\\\n\r\[]`
const source = fs.readFileSync(target, 'utf8')
if (source.includes(vulnerable)) {
  if (source.split(vulnerable).length !== 2) throw new Error('Unexpected validator regex: review the dependency patch')
  // '[' must be consumed ONLY by the character-class branch, never by the
  // generic-character branch. Disjoint alternatives remove exponential retries.
  fs.writeFileSync(target, source.replace(vulnerable, fixed))
  console.log('Patched otzaria-plugin-validator regex backtracking')
} else if (!source.includes(fixed) && !source.includes(upstreamFixed)) {
  throw new Error('Plugin validator scanner changed; review the ReDoS patch before deploying')
}
