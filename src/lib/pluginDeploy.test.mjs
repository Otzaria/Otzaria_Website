import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const deployScript = path.resolve('scripts/deploy-web.sh')

function fixture(mode = 'success', pm2App = 'otzaria') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-deploy-test-'))
  const seed = path.join(root, 'seed')
  const remote = path.join(root, 'remote.git')
  const live = path.join(root, 'otzaria-web')
  const bin = path.join(root, 'bin')
  fs.mkdirSync(seed); fs.mkdirSync(bin)

  const run = (command, args, cwd = seed) => {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const write = (base, relative, content) => {
    const file = path.join(base, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  run('git', ['init', '-q']); run('git', ['config', 'user.email', 'test@example.invalid']); run('git', ['config', 'user.name', 'Test'])
  write(seed, '.gitignore', 'node_modules/\n.next/\n.env\nstorage/\nvar/\npublic/uploads/\npublic/tessdata/\npublic/version.json\npublic/export-editor/\n')
  write(seed, 'app.js', 'one\n'); write(seed, 'package.json', '{"scripts":{"build":"fixture"}}\n')
  write(seed, 'public/asset.txt', 'tracked\n')
  write(seed, 'scripts/check-production-trace.cjs', '// fixture packaged-runtime verification\n')
  run('git', ['add', '.']); run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'one'])
  run('git', ['init', '--bare', '-q', remote], root)
  run('git', ['remote', 'add', 'origin', remote]); run('git', ['push', '-q', '-u', 'origin', 'HEAD:master'])
  run('git', ['clone', '-q', remote, live], root)
  run('git', ['checkout', '-q', 'master'], live)
  const first = run('git', ['rev-parse', 'HEAD'], live)
  write(live, '.env', 'SECRET=fixture\n'); write(live, 'storage/keep', 'storage\n')
  write(live, 'var/dicta-uploads/keep', 'dicta\n'); write(live, 'public/uploads/keep', 'upload\n')
  write(live, 'public/tessdata/heb.traineddata', 'language model\n')

  const command = (name, body) => {
    const file = path.join(bin, name)
    fs.writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${body}`)
    fs.chmodSync(file, 0o755)
  }
  command('npm', `
echo "npm $*" >> "$TEST_ROOT/trace"
case "$1" in
  ci)
    [[ "$TEST_MODE" != install ]] || exit 9
    mkdir -p node_modules/.bin
    printf '#!/usr/bin/env bash\\nexit 0\\n' > node_modules/.bin/next
    chmod +x node_modules/.bin/next
    ;;
  install) [[ "$*" == *"#$TEST_VALIDATOR"* ]] || exit 8 ;;
  run)
    [[ "$2" == build ]] || exit 7
    [[ "$TEST_MODE" != build ]] || exit 9
    [[ ! -e public/uploads && ! -e storage && ! -e var ]] || exit 10
    if [[ "$TEST_MODE" == require_cache ]]; then [[ -f .next/cache/reused ]] || exit 11; fi
    mkdir -p .next/static .next/cache public/export-editor
    printf 'build' > .next/BUILD_ID
    printf '{}' > .next/prerender-manifest.json
    printf 'cache' > .next/cache/reused
    printf 'static' > .next/static/chunk.js
    version=$(tr -d '\\n' < app.js)
    printf '{"version":"%s"}' "$version" > public/version.json
    printf 'offline' > public/export-editor/dicta-editor-offline.html
    ;;
esac
`)
  command('pm2', `
echo "pm2 $*" >> "$TEST_ROOT/trace"
[[ "$2" == "$TEST_PM2_APP" ]] || exit 8
if [[ "$1" == describe && "$TEST_MODE" == missing_process ]]; then exit 9; fi
if [[ "$1" == restart && "$TEST_MODE" == restart ]]; then exit 9; fi
`)
  command('curl', `
last="\${!#}"
if [[ "$last" == */api/dicta/health ]]; then printf '{"status":"ok"}'; exit 0; fi
version=$(cat "$TEST_LIVE/public/version.json")
if [[ "$TEST_MODE" == health && "$version" == *one* ]]; then exit 22; fi
if [[ "$TEST_MODE" == health_second && "$version" == *two* ]]; then exit 22; fi
if [[ "$TEST_MODE" == recovery_unhealthy && "$(readlink -f "$TEST_LIVE")" == *otzaria-releases* ]]; then exit 22; fi
printf '%s' "$version"
`)
  command('sleep', ':\n')
  command('systemctl', `
echo "systemctl $*" >> "$TEST_ROOT/trace"
[[ "$TEST_MODE" != broker_restart ]] || exit 1
`)

  const deploy = (sha, validator = 'a'.repeat(40), currentMode = mode, extraEnv = {}) => spawnSync(
    'bash', [deployScript, sha, validator, live], {
      env: {
        ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        TEST_ROOT: root, TEST_LIVE: live, TEST_MODE: currentMode,
        TEST_VALIDATOR: validator, TEST_PM2_APP: pm2App, PM2_APP: pm2App,
        BROKER_DIR: path.join(root, 'broker'),
        ...extraEnv,
      },
      encoding: 'utf8', timeout: 30000,
    },
  )
  const addCommit = value => {
    write(seed, 'app.js', `${value}\n`)
    run('git', ['add', 'app.js']); run('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', value])
    run('git', ['push', '-q', 'origin', 'HEAD:master'])
    return run('git', ['rev-parse', 'HEAD'])
  }
  const cloneBroker = () => run('git', ['clone', '-q', remote, path.join(root, 'broker')], root)
  return {
    root, live, first, deploy, addCommit, cloneBroker,
    trace: () => fs.existsSync(path.join(root, 'trace')) ? fs.readFileSync(path.join(root, 'trace'), 'utf8') : '',
    releases: () => fs.existsSync(path.join(root, 'otzaria-releases')) ? fs.readdirSync(path.join(root, 'otzaria-releases')) : [],
    readLive: relative => fs.readFileSync(path.join(live, relative), 'utf8').trim(),
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('deployment rejects mutable refs before touching the server', () => {
  const result = spawnSync('bash', [deployScript, 'master', 'v1', '/missing/app'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /immutable/)
})

for (const mode of ['missing_process', 'install', 'build']) {
  test(`${mode} failure leaves the legacy installation active`, () => {
    const f = fixture(mode)
    try {
      const result = f.deploy(f.first)
      assert.notEqual(result.status, 0, result.stdout + result.stderr)
      assert.equal(fs.lstatSync(f.live).isSymbolicLink(), false)
      assert.equal(f.readLive('app.js'), 'one')
      assert.equal(f.readLive('storage/keep'), 'storage')
    } finally { f.remove() }
  })
}

test('first deployment migrates persistent data and installs the established next start runtime', () => {
  const f = fixture()
  try {
    const result = f.deploy(f.first)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.lstatSync(f.live).isSymbolicLink(), true)
    assert.equal(f.readLive('storage/keep'), 'storage')
    assert.equal(f.readLive('var/dicta-uploads/keep'), 'dicta')
    assert.equal(f.readLive('public/uploads/keep'), 'upload')
    assert.equal(f.readLive('public/tessdata/heb.traineddata'), 'language model')
    assert.equal(f.readLive('.env'), 'SECRET=fixture')
    assert.equal(f.readLive('public/asset.txt'), 'tracked')
    assert.equal(f.readLive('app.js'), 'one')
    assert.equal(fs.existsSync(path.join(f.live, '.git')), false)
    assert.equal(f.releases().length, 1)
    assert.doesNotMatch(f.trace(), /test:plugin-safety|test:deployment-regressions/)
    assert.match(f.trace(), /pm2 stop otzaria/)
    assert.match(f.trace(), /pm2 restart otzaria/)
  } finally { f.remove() }
})

test('later deployment reuses build cache and retains exactly current and previous releases', () => {
  const f = fixture()
  try {
    assert.equal(f.deploy(f.first).status, 0)
    const second = f.addCommit('two')
    const result = f.deploy(second, 'b'.repeat(40), 'require_cache')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(f.readLive('public/version.json'), '{"version":"two"}')
    assert.equal(f.releases().length, 2)
    assert.equal(f.trace().match(/pm2 stop otzaria/g)?.length, 1)

    const third = f.addCommit('three')
    const thirdResult = f.deploy(third, 'c'.repeat(40), 'require_cache')
    assert.equal(thirdResult.status, 0, thirdResult.stdout + thirdResult.stderr)
    assert.equal(f.readLive('public/version.json'), '{"version":"three"}')
    assert.equal(f.releases().length, 2)
  } finally { f.remove() }
})

test('failed health check atomically restores the previous release', () => {
  const f = fixture()
  try {
    assert.equal(f.deploy(f.first).status, 0)
    const second = f.addCommit('two')
    const result = f.deploy(second, 'b'.repeat(40), 'health_second')
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.equal(f.readLive('public/version.json'), '{"version":"one"}')
    assert.equal(f.releases().length, 1)
    assert.match(result.stderr, /restoring the previous release/)
  } finally { f.remove() }
})

test('failed health check during the one-time migration restores the legacy checkout', () => {
  const f = fixture('health')
  try {
    const result = f.deploy(f.first)
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.lstatSync(f.live).isSymbolicLink(), false)
    assert.equal(f.readLive('app.js'), 'one')
    assert.equal(f.readLive('storage/keep'), 'storage')
    assert.equal(f.releases().length, 0)
    assert.match(result.stderr, /restoring the previous release/)
  } finally { f.remove() }
})

test('moving validator tag creates a distinct release even for the same website commit', () => {
  const f = fixture()
  try {
    assert.equal(f.deploy(f.first, 'a'.repeat(40)).status, 0)
    const result = f.deploy(f.first, 'b'.repeat(40))
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(f.releases().length, 2)
  } finally { f.remove() }
})

test('redeploying identical website and validator commits is a safe no-op', () => {
  const f = fixture()
  try {
    const validator = 'a'.repeat(40)
    assert.equal(f.deploy(f.first, validator).status, 0)
    const release = fs.realpathSync(f.live)
    const npmCalls = f.trace().match(/^npm /gm)?.length
    const result = f.deploy(f.first, validator, 'require_cache')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.realpathSync(f.live), release)
    assert.equal(f.releases().length, 1)
    assert.match(result.stdout, /already active/)
    assert.equal(f.trace().match(/^npm /gm)?.length, npmCalls)
  } finally { f.remove() }
})

test('failed repeat deployment can never delete the active release', () => {
  const f = fixture()
  try {
    const validator = 'a'.repeat(40)
    assert.equal(f.deploy(f.first, validator).status, 0)
    const active = fs.realpathSync(f.live)
    const result = f.deploy(f.first, validator, 'build')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.realpathSync(f.live), active)
    assert.equal(f.readLive('public/version.json'), '{"version":"one"}')
  } finally { f.remove() }
})

for (const [name, extraEnv] of [
  ['build equals live', root => ({ BUILD_DIR: path.join(root, 'otzaria-web') })],
  ['releases equal shared', root => ({ RELEASES_DIR: path.join(root, 'same'), SHARED_DIR: path.join(root, 'same') })],
  ['releases outside root', root => ({ RELEASES_DIR: path.join(root, 'nested', 'releases') })],
]) {
  test(`unsafe path configuration is rejected: ${name}`, () => {
    const f = fixture()
    try {
      const result = f.deploy(f.first, 'a'.repeat(40), 'success', extraEnv(f.root))
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /Deployment path|paths must be distinct/)
      assert.equal(f.readLive('storage/keep'), 'storage')
      assert.doesNotMatch(f.trace(), /npm |pm2 stop/)
    } finally { f.remove() }
  })
}

test('a pre-existing legacy recovery directory blocks migration before PM2 stops', () => {
  const f = fixture()
  try {
    const legacy = path.join(f.root, `.otzaria-legacy.${f.first}-${'a'.repeat(40)}`)
    fs.mkdirSync(legacy)
    fs.writeFileSync(path.join(legacy, 'do-not-delete'), 'recovery')
    const result = f.deploy(f.first)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Legacy recovery data already exists/)
    assert.equal(fs.readFileSync(path.join(legacy, 'do-not-delete'), 'utf8'), 'recovery')
    assert.doesNotMatch(f.trace(), /npm |pm2 stop/)
  } finally { f.remove() }
})

test('host-local deployment lock rejects a concurrent invocation', () => {
  const f = fixture()
  const lock = path.join(f.root, '.otzaria-deploy.lock')
  try {
    // The outer shell retains fd 8 while the child deployment tries fd 9.
    const command = `exec 8>"${lock}"; flock -n 8; PATH="${path.join(f.root, 'bin')}:$PATH" TEST_ROOT="${f.root}" TEST_LIVE="${f.live}" TEST_MODE=success TEST_VALIDATOR=${'a'.repeat(40)} TEST_PM2_APP=otzaria PM2_APP=otzaria bash "${deployScript}" ${f.first} ${'a'.repeat(40)} "${f.live}"`
    const result = spawnSync('bash', ['-c', command], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /already running/)
  } finally {
    f.remove()
  }
})

test('an interrupted migration with a missing live path is recovered safely', () => {
  const f = fixture()
  try {
    const legacy = path.join(f.root, `.otzaria-legacy.${f.first}-${'a'.repeat(40)}`)
    fs.renameSync(f.live, legacy)
    const result = f.deploy(f.first)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(f.readLive('storage/keep'), 'storage')
    assert.equal(fs.existsSync(legacy), false)
    assert.match(result.stdout, /Recovering an interrupted one-time migration/)
  } finally { f.remove() }
})

test('an interrupted migration after link swap removes legacy only after health passes', () => {
  const f = fixture()
  try {
    const validator = 'a'.repeat(40)
    assert.equal(f.deploy(f.first, validator).status, 0)
    const legacy = path.join(f.root, `.otzaria-legacy.${f.first}-${validator}`)
    fs.mkdirSync(legacy)
    fs.writeFileSync(path.join(legacy, 'recovery-marker'), 'keep until healthy')
    const result = f.deploy(f.first, validator)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.existsSync(legacy), false)
    assert.match(result.stdout, /already active/)
  } finally { f.remove() }
})

test('an unhealthy release after interrupted link swap rolls back to legacy', () => {
  const f = fixture()
  try {
    const validator = 'a'.repeat(40)
    assert.equal(f.deploy(f.first, validator).status, 0)
    const failedRelease = fs.realpathSync(f.live)
    const legacy = path.join(f.root, `.otzaria-legacy.${f.first}-${validator}`)
    fs.mkdirSync(path.join(legacy, 'public'), { recursive: true })
    fs.writeFileSync(path.join(legacy, 'public/version.json'), '{"version":"legacy"}')
    fs.writeFileSync(path.join(legacy, 'app.js'), 'legacy')
    const result = f.deploy(f.first, validator, 'recovery_unhealthy')
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.lstatSync(f.live).isSymbolicLink(), false)
    assert.equal(f.readLive('public/version.json'), '{"version":"legacy"}')
    assert.equal(fs.existsSync(failedRelease), false)
    assert.match(result.stderr, /Legacy checkout restored/)
  } finally { f.remove() }
})

test('a successful deployment moves the broker checkout and restarts it only if running', () => {
  const f = fixture()
  try {
    assert.equal(f.deploy(f.first).status, 0)
    assert.doesNotMatch(f.trace(), /systemctl/)
    f.cloneBroker()
    const second = f.addCommit('two')
    const result = f.deploy(second, 'b'.repeat(40))
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(fs.readFileSync(path.join(f.root, 'broker', 'app.js'), 'utf8').trim(), 'two')
    assert.match(f.trace(), /systemctl try-restart otzaria-service-broker/)
  } finally { f.remove() }
})

test('a broker update failure warns without failing the live deployment', () => {
  const f = fixture()
  try {
    assert.equal(f.deploy(f.first).status, 0)
    f.cloneBroker()
    const second = f.addCommit('two')
    const result = f.deploy(second, 'b'.repeat(40), 'broker_restart')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(f.readLive('public/version.json'), '{"version":"two"}')
    assert.match(result.stderr, /broker was not updated/)
  } finally { f.remove() }
})
