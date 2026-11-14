import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { escapeForList } from './util.js'

const MAX_HITS_PER_RULE_PER_FILE = 40
export const MAX_HOTSPOT_LINES = 100_000
const LONG_LINE = 1500

const DEPENDENCY_FILES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'cargo.toml', 'cargo.lock', 'go.mod', 'go.sum', 'pipfile', 'pipfile.lock', 'poetry.lock', 'pyproject.toml',
  'setup.cfg', 'uv.lock', 'gemfile', 'gemfile.lock', 'packages.config', 'directory.packages.props', 'packages.lock.json',
  'pubspec.yaml', 'pubspec.lock', 'gradle.lockfile', 'pom.xml', 'composer.json', 'composer.lock', 'podfile',
  'podfile.lock', 'package.swift', 'package.resolved', 'vcpkg.json', 'conanfile.txt', 'conanfile.py', 'deno.json',
  'deno.lock', 'mix.exs', 'mix.lock', 'build.sbt', 'libs.versions.toml',
])
const DEPENDENCY_PATTERNS = [/^requirements.*\.txt$/, /\.csproj$/, /\.fsproj$/, /\.vbproj$/, /\.nuspec$/, /\.gemspec$/]
const BUILD_FILES = new Set([
  'makefile', 'gnumakefile', 'cmakelists.txt', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'settings.gradle.kts', 'gradlew', 'gradlew.bat', 'build.rs', 'setup.py', 'dockerfile', 'justfile', 'taskfile.yml',
  'meson.build', 'build.zig', 'rakefile', 'build.ps1', 'build.sh', 'install.sh', 'electron-builder.yml',
  'electron-builder.json', 'forge.config.js', 'tauri.conf.json', 'wails.json', 'webpack.config.js', 'vite.config.js',
  'vite.config.ts', 'rollup.config.js', 'goreleaser.yml', '.goreleaser.yml', '.goreleaser.yaml', 'snapcraft.yaml',
])
const BUILD_EXTENSIONS = new Set(['.sh', '.bash', '.ps1', '.psm1', '.bat', '.cmd', '.nsi', '.nsh', '.wxs', '.wxi', '.iss',
  '.spec', '.mk', '.cmake', '.vcxproj', '.sln', '.props', '.targets', '.plist', '.entitlements', '.desktop', '.service'])

// משנים את מה ש-GitHub מכניס לארכיון (export-ignore/subst), submodules ו-LFS — חובה לקרוא.
const GIT_CONFIG_FILES = new Set(['.gitattributes', '.gitmodules', '.lfsconfig'])
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.py', '.pyw',
  '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle', '.cs', '.csx', '.vb', '.fs', '.fsx', '.c', '.h',
  '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.m', '.mm', '.swift', '.php', '.pl', '.pm', '.lua', '.dart', '.r', '.jl', '.ex',
  '.exs', '.erl', '.hs', '.clj', '.zig', '.nim', '.tcl', '.awk', '.zsh', '.fish', '.psd1', '.vbs', '.vba', '.wsf',
  '.ahk', '.applescript', '.scpt', '.html', '.htm', '.json', '.jsonc', '.json5', '.yml', '.yaml', '.toml', '.xml', '.ini',
  '.cfg', '.conf', '.config', '.properties', '.manifest', '.reg', '.inf', '.sql', '.proj', '.csproj', '.fsproj', '.vbproj'])

/** קוד, סקריפט, קובץ בנייה או מניפסט: תוכן בינארי בקובץ כזה אינו ניתן לסקירה ולכן נדחה. */
export function isCodeLikePath(filePath) {
  const lower = filePath.toLowerCase()
  const base = path.posix.basename(lower)
  const ext = path.posix.extname(base)
  return CODE_EXTENSIONS.has(ext) || BUILD_EXTENSIONS.has(ext) || BUILD_FILES.has(base) || DEPENDENCY_FILES.has(base) ||
    DEPENDENCY_PATTERNS.some((re) => re.test(base)) || GIT_CONFIG_FILES.has(base) || /(^|\/)\.github\/(?:workflows|actions)\//.test(lower)
}

/** קטגוריות "חובה לבדוק" לפי נתיב: workflow, build, dependency, git. */
export function classifyPath(filePath) {
  const lower = filePath.toLowerCase()
  const base = path.posix.basename(lower)
  const ext = path.posix.extname(base)
  const cats = []
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(lower) || /(^|\/)action\.ya?ml$/.test(lower)) cats.push('workflow')
  if (BUILD_FILES.has(base) || BUILD_EXTENSIONS.has(ext) || lower.includes('/.github/actions/') || /(^|\/)scripts?\//.test(lower)) {
    cats.push('build')
  }
  if (DEPENDENCY_FILES.has(base) || DEPENDENCY_PATTERNS.some((re) => re.test(base))) cats.push('dependency')
  if (GIT_CONFIG_FILES.has(base)) cats.push('git')
  return cats
}

/** כללי סינון דטרמיניסטיים. כל ביטוי ליניארי (ללא כמתים מקוננים). */
export const RULES = Object.freeze([
  { id: 'network_download', re: /\b(?:fetch\s*\(|axios|XMLHttpRequest|https?\.(?:get|request)\s*\(|urllib|requests\.(?:get|post)|HttpClient|WebClient|Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|DownloadFile|DownloadString|curl\b|wget\b|reqwest|net\/http|URLSession|okhttp|http\.Get\(|bitsadmin|certutil\s+-urlcache)/i },
  { id: 'process_exec', re: /\b(?:child_process|execSync|execFile|spawnSync|spawn\s*\(|Process\.Start|ProcessStartInfo|subprocess|os\.system|popen|Runtime\.getRuntime|ProcessBuilder|ShellExecute|CreateProcess|WinExec|std::process::Command|Command::new|exec\.Command|system\s*\()/ },
  { id: 'dynamic_code', re: /\b(?:eval\s*\(|new\s+Function\s*\(|vm\.run|vm\.Script|importlib|__import__|Assembly\.Load|LoadLibrary|dlopen|Reflection\.Emit|require\s*\(\s*[^'"`\s)]|import\s*\(\s*[^'"`\s)]|Invoke-Expression|\biex\b|FromBase64String|atob\s*\()/ },
  { id: 'shell', re: /(?:\bpowershell\b|\bpwsh\b|cmd(?:\.exe)?\s+\/[ck]\b|\bbash\s+-c\b|\bsh\s+-c\b|\/bin\/(?:ba)?sh\b|Start-Process|-EncodedCommand|osascript)/i },
  { id: 'hardcoded_url', re: /\b(?:https?|wss?|ftp):\/\/(?!(?:127\.0\.0\.1|localhost|\[::1\])[:/])[^\s'"`<>()]+/i },
  { id: 'registry', re: /\b(?:HKEY_[A-Z_]+|HKLM|HKCU|Registry\.(?:SetValue|LocalMachine|CurrentUser)|RegSetValue|RegCreateKey|reg(?:\.exe)?\s+add|winreg|New-ItemProperty|Set-ItemProperty)/i },
  { id: 'service_or_elevation', re: /\b(?:sc(?:\.exe)?\s+(?:create|config)|New-Service|ServiceInstaller|ServiceBase|CreateService|systemctl|launchctl|LaunchDaemons|LaunchAgents|schtasks|Register-ScheduledTask|sudo\b|runas\b|requireAdministrator|RequestExecutionLevel|setuid|SeDebugPrivilege|CurrentVersion\\+Run|AuthorizationExecuteWithPrivileges|SMJobBless)/i },
  { id: 'non_loopback_listen', re: /(?:0\.0\.0\.0|\[::\]|IPAddress\.(?:Any|IPv6Any)|INADDR_ANY|in6addr_any|ListenAnyIP|\bhost\s*[:=]\s*['"]{2}|['"]::['"]|\.listen\(\s*\d+\s*\))/i },
  { id: 'secret_like', re: /(?:AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})/ },
  { id: 'encoded_blob', re: /[A-Za-z0-9+/]{240,}={0,2}/ },
])
const DETECTION_RE = /otzaria-service|well-known/i
const HOST_ORIGIN_RE = /\b(?:host|origin|vary|access-control-allow-origin|cors)\b/i

/**
 * סורק טקסט אחד ומחזיר [{line, rule}]. אינו מחליט דבר — רק מכוון את הסקירה.
 */
export function scanText(text) {
  const hits = []
  const counts = new Map()
  const push = (line, rule) => {
    const c = counts.get(rule) ?? 0
    if (c > MAX_HITS_PER_RULE_PER_FILE) return
    counts.set(rule, c + 1)
    // מעבר לתקרה לכל כלל: שורה אחת שמפנה לקריאת הקובץ המלא, כדי שהקיצור לא יוסתר.
    hits.push(c < MAX_HITS_PER_RULE_PER_FILE ? { line, rule } : { line: 0, rule: `${rule}:more_than_${MAX_HITS_PER_RULE_PER_FILE}` })
  }
  const detectionFile = DETECTION_RE.test(text)
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > LONG_LINE) push(i + 1, 'long_line')
    for (const rule of RULES) {
      if (rule.re.test(line)) push(i + 1, rule.id)
    }
    if (detectionFile && (DETECTION_RE.test(line) || HOST_ORIGIN_RE.test(line))) push(i + 1, 'detection_endpoint_host_origin')
  }
  return hits
}

/**
 * מפיק את HOTSPOTS.txt מתוך האינדקס: כל קובצי workflow/build/dependency/git תמיד, כל קובץ בינארי/קישור,
 * ושורות שזוהו בכללים. מעבר ל-maxLines מוחזר overLimit (המקור שולט בכמות, ולכן אין קיצור שקט).
 */
export async function buildHotspots(rows, filesDir, { maxLines = MAX_HOTSPOT_LINES } = {}) {
  const out = []
  let overLimit = false
  const add = (n, p, line, rule) => {
    if (out.length >= maxLines) {
      overLimit = true
      return
    }
    out.push([n ?? '-', escapeForList(p), line, rule].join('\t'))
  }
  const counts = {}
  const bump = (rule) => {
    counts[rule] = (counts[rule] ?? 0) + 1
  }
  for (const r of rows) {
    for (const cat of classifyPath(r.path)) {
      add(r.n, r.path, 0, `always_review:${cat}`)
      bump(`always_review:${cat}`)
    }
    if (r.kind !== 'text') {
      add(r.n, r.path, 0, `non_text:${r.kind}`)
      bump(`non_text:${r.kind}`)
    }
  }
  for (const r of rows) {
    if (overLimit) break
    if (r.kind !== 'text' || !r.n) continue
    const text = await readFile(path.join(filesDir, `${r.n}.txt`), 'utf8')
    for (const hit of scanText(text)) {
      add(r.n, r.path, hit.line, hit.rule)
      bump(hit.rule)
    }
  }
  const header = [
    '# HOTSPOTS — סינון דטרמיניסטי (ללא AI). הכוונה לסקירה בלבד: ממצא כאן אינו דחייה, והיעדרו אינו אישור.',
    '# עמודות: מספר קובץ | נתיב | שורה (0 = כל הקובץ) | כלל',
    '# always_review:* — קובצי workflow, בנייה, תלויות והגדרות git: חובה לקרוא במלואם.',
    `# <כלל>:more_than_${MAX_HITS_PER_RULE_PER_FILE} — בקובץ יש עוד התאמות לכלל: יש לקרוא את הקובץ המלא.`,
  ]
  return { text: header.concat(out).join('\n') + '\n', counts, lines: out.length, overLimit, maxLines }
}
