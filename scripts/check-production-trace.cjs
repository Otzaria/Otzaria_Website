const fs = require('node:fs')
const path = require('node:path')

function checkProductionTrace(root = process.cwd()) {
  const packageDir = path.join(root, 'node_modules', 'otzaria-plugin-validator')
  const main = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).main
  const required = [
    'scripts/plugin-validation-worker.mjs', 'src/lib/pluginValidationCore.js',
    'src/lib/pluginArchive.js', 'src/lib/pluginLimits.js',
  ].map(file => path.resolve(root, file))
  required.push(path.resolve(packageDir, main))
  required.push(path.join(packageDir, 'package.json'), path.join(packageDir, 'src/spec.json'))
  for (const file of required) {
    if (!fs.statSync(file).isFile()) throw new Error(`Worker runtime file missing: ${file}`)
  }
  for (const route of ['plugins/upload', 'plugins/[id]/edit', 'admin/plugins/[id]/edit']) {
    const file = path.join(root, '.next/server/app/api', route, 'route.js.nft.json')
    const trace = JSON.parse(fs.readFileSync(file, 'utf8'))
    const included = new Set(trace.files.map(entry => path.resolve(path.dirname(file), entry)))
    for (const requiredFile of required) {
      if (!included.has(requiredFile)) throw new Error(`Worker runtime absent from ${route} trace: ${requiredFile}`)
    }
  }
  const runtimeRoots = ['public/uploads', 'storage'].map(dir => path.resolve(root, dir) + path.sep)
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.nft.json')) {
        const trace = JSON.parse(fs.readFileSync(file, 'utf8'))
        for (const item of trace.files) {
          const resolved = path.resolve(dir, item)
          if (runtimeRoots.some(base => resolved.startsWith(base))) {
            throw new Error(`Mutable runtime data included in production trace: ${resolved}`)
          }
        }
      }
    }
  }
  walk(path.join(root, '.next'))
  console.log('Production traces include plugin workers and exclude mutable runtime data')
}

module.exports = { checkProductionTrace }
if (require.main === module) checkProductionTrace()
