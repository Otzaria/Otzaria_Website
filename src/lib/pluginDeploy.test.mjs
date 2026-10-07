import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const deployScript = path.resolve('scripts/deploy-web.sh')
function fixture(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-deploy-test-'))
  const app = path.join(root, 'app'); const bin = path.join(root, 'bin')
  fs.mkdirSync(app); fs.mkdirSync(bin)
  const write = (relative, content) => {
    const file = path.join(app, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content)
  }
  const git = (...args) => {
    const r = spawnSync('/usr/bin/git', args, { cwd: app, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim()
  }
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test')
  write('.gitignore', 'node_modules/\n.next/\n.env\nstorage/\npublic/uploads/\npublic/version.json\npublic/export-editor/\n')
  write('app.js', 'old'); write('scripts/patch-plugin-validator.cjs', '// fixture\n')
  git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'old'); const old = git('rev-parse', 'HEAD')
  write('app.js', 'new'); git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'new'); const next = git('rev-parse', 'HEAD')
  git('reset', '--hard', old)
  write('.next/marker', 'old'); write('node_modules/marker', 'old'); write('public/version.json', '{"version":"old"}\n')
  write('public/export-editor/dicta-editor-offline.html', 'old'); write('storage/keep', 'persistent'); write('public/uploads/keep', 'persistent'); write('.env', 'fixture')
  const command = (name, code) => { const file = path.join(bin, name); fs.writeFileSync(file, '#!/usr/bin/env bash\nset -eu\n' + code); fs.chmodSync(file, 0o755) }
  command('npm', `echo "npm $*" >> "$TEST_ROOT/trace"
case "$1" in
  ci) [[ "$TEST_MODE" != install ]] || exit 9; mkdir -p node_modules; echo new > node_modules/marker ;;
  install) [[ "$*" == *"#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"* ]] || exit 8 ;;
  run)
    if [[ "$2" == test:plugin-safety ]]; then [[ "$TEST_MODE" != safety ]] || exit 9; fi
    if [[ "$2" == test:deployment-regressions ]]; then [[ "$TEST_MODE" != regressions ]] || exit 9; fi
    if [[ "$2" == build ]]; then
      [[ "$TEST_MODE" != build ]] || exit 9
      # The build must not traverse mutable runtime data (including symlinks).
      [[ ! -e public/uploads && ! -L public/uploads && ! -e storage && ! -L storage ]] || exit 10
      mkdir -p .next public/export-editor
      echo new > .next/marker; echo fixture > .next/BUILD_ID
      [[ "$TEST_MODE" == incomplete ]] || echo '{}' > .next/prerender-manifest.json
      echo '{"version":"new"}' > public/version.json
      echo new > public/export-editor/dicta-editor-offline.html
    fi ;;
esac
`)
  command('pm2', `echo "pm2 $*" >> "$TEST_ROOT/trace"
if [[ "$1" == restart ]]; then
  count=0; [[ ! -f "$TEST_ROOT/restarts" ]] || count=$(cat "$TEST_ROOT/restarts")
  count=$((count + 1)); echo "$count" > "$TEST_ROOT/restarts"
  [[ "$TEST_MODE" != rollback_restart ]] || exit 9
  if [[ "$count" == 1 && ( "$TEST_MODE" == restart || "$TEST_MODE" == rollback_mv || "$TEST_MODE" == rollback_git ) ]]; then exit 9; fi
fi
`)
  command('curl', `if [[ "$TEST_MODE" == health && $(cat "$TEST_APP/public/version.json") == *new* ]]; then exit 22; fi
if [[ "$TEST_MODE" == wrong && $(cat "$TEST_APP/public/version.json") == *new* ]]; then echo '{"version":"wrong"}'; else cat "$TEST_APP/public/version.json"; fi
`)
  command('sleep', ':\n')
  command('mv', `if [[ "$TEST_MODE" == rollback_mv && "$1" == */previous/.next ]]; then exit 9; fi
exec /bin/mv "$@"
`)
  command('git', `if [[ "$TEST_MODE" == rollback_git && "$*" == "reset --hard $TEST_OLD" ]]; then exit 9; fi
exec /usr/bin/git "$@"
`)
  const run = () => {
    const result = spawnSync('bash', [deployScript, next, 'a'.repeat(40), app], {
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, TEST_ROOT: root, TEST_APP: app, TEST_MODE: mode, TEST_OLD: old },
      encoding: 'utf8', timeout: 30000,
    })
    // An injected deployment failure must come from the script, not from the
    // test harness killing a slow child before rollback finished.
    assert.equal(result.error, undefined, String(result.error))
    assert.equal(result.signal, null)
    return result
  }
  return { root, app, run, git, old, next, read: p => fs.readFileSync(path.join(app, p), 'utf8').trim(),
    trace: () => fs.existsSync(path.join(root, 'trace')) ? fs.readFileSync(path.join(root, 'trace'), 'utf8') : '',
    stages: () => fs.readdirSync(root).filter(n => n.startsWith('.otzaria-deploy.')),
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('deployment rejects mutable refs before touching a checkout', () => {
  const r = spawnSync('bash', [deployScript, 'master', 'v1', '/missing/app'], { encoding: 'utf8' })
  assert.notEqual(r.status, 0); assert.match(r.stderr, /immutable/)
})
for (const mode of ['install', 'safety', 'regressions', 'build', 'incomplete']) {
  test(`deployment ${mode} failure leaves active code/build/dependencies intact`, () => {
    const f = fixture(mode)
    try {
      const r = f.run(); assert.notEqual(r.status, 0, r.stdout + r.stderr)
      assert.equal(f.read('app.js'), 'old'); assert.equal(f.read('.next/marker'), 'old'); assert.equal(f.read('node_modules/marker'), 'old')
      assert.equal(f.git('rev-parse', 'HEAD'), f.old); assert.doesNotMatch(f.trace(), /pm2/); assert.deepEqual(f.stages(), [])
    } finally { f.remove() }
  })
}
test('successful deployment installs one coherent build and preserves persistent data', () => {
  const f = fixture('success')
  try {
    const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(f.read('app.js'), 'new'); assert.equal(f.read('.next/marker'), 'new'); assert.equal(f.read('node_modules/marker'), 'new')
    assert.equal(f.read('public/export-editor/dicta-editor-offline.html'), 'new')
    assert.equal(f.read('storage/keep'), 'persistent'); assert.equal(f.read('public/uploads/keep'), 'persistent'); assert.equal(f.read('.env'), 'fixture')
    assert.equal(f.git('rev-parse', 'HEAD'), f.next); assert.deepEqual(f.stages(), [])
    assert.ok(f.trace().indexOf('npm run build') < f.trace().indexOf('pm2 stop'))
  } finally { f.remove() }
})
test('external upload symlinks stay in the live installation and never enter the build', () => {
  const f = fixture('success')
  try {
    const target = path.join(f.root, 'external-page.jpg')
    fs.writeFileSync(target, 'uploaded image')
    const link = path.join(f.app, 'public/uploads/page.jpg')
    fs.symlinkSync(target, link)
    const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(fs.readlinkSync(link), target)
    assert.equal(fs.readFileSync(link, 'utf8'), 'uploaded image')
    assert.equal(f.git('rev-parse', 'HEAD'), f.next)
    assert.deepEqual(f.stages(), [])
  } finally { f.remove() }
})
for (const mode of ['restart', 'health', 'wrong']) {
  test(`deployment ${mode} failure restores previous code/build/dependencies`, () => {
    const f = fixture(mode)
    try {
      const r = f.run(); assert.notEqual(r.status, 0, r.stdout + r.stderr)
      assert.equal(f.read('app.js'), 'old'); assert.equal(f.read('.next/marker'), 'old'); assert.equal(f.read('node_modules/marker'), 'old')
      assert.equal(f.read('public/version.json'), '{"version":"old"}'); assert.equal(f.read('public/export-editor/dicta-editor-offline.html'), 'old')
      assert.equal(f.git('rev-parse', 'HEAD'), f.old); assert.deepEqual(f.stages(), [])
      assert.match(r.stderr, /restoring/)
    } finally { f.remove() }
  })
}
for (const mode of ['rollback_restart', 'rollback_mv', 'rollback_git']) {
  test(`${mode} failure retains recovery files instead of deleting the backup`, () => {
    const f = fixture(mode)
    try {
      const r = f.run(); assert.notEqual(r.status, 0); assert.equal(f.stages().length, 1)
      assert.match(r.stderr, /backup retained/)
      if (mode === 'rollback_mv') assert.equal(fs.readFileSync(path.join(f.root, f.stages()[0], 'previous/.next/marker'), 'utf8').trim(), 'old')
    } finally { f.remove() }
  })
}
