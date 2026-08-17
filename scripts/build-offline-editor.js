const fs = require('fs/promises');
const path = require('path');
const Babel = require('@babel/core');
const presetReact = require('@babel/preset-react');

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'export-editor', 'dicta-editor-offline.html');

// הסדר משמעותי: קובץ שמצהיר על שם חייב להופיע לפני מי שמשתמש בו (ראה
// createRenameCollisionsPlugin — הראשון שומר על השם).
const COMPONENT_PATHS = [
  'src/lib/color-constants.js',
  'src/lib/avatar-colors.js',
  'src/lib/editorUtils.js',
  'src/lib/hebrewWordUtils.js',
  'src/lib/shortcuts.js',
  'src/components/providers/DialogContext.jsx',
  'src/components/ui/Modal.jsx',
  'src/components/ui/FormInput.jsx',
  'src/components/ui/Button.jsx',
  'src/components/ui/LoadingSpinner.jsx',
  'src/components/providers/LoadingContext.jsx',
  'src/components/dicta-tools/CreateHeadersModal.jsx',
  'src/components/dicta-tools/SingleLetterHeadersModal.jsx',
  'src/components/dicta-tools/ChangeHeadingModal.jsx',
  'src/components/dicta-tools/PunctuateModal.jsx',
  'src/components/dicta-tools/PageBHeaderModal.jsx',
  'src/components/dicta-tools/ReplacePageBModal.jsx',
  'src/components/dicta-tools/HeaderErrorCheckerModal.jsx',
  'src/components/dicta-tools/TextCleanerModal.jsx',
  'src/components/dicta-tools/AddPageNumberModal.jsx',
  'src/components/dicta-tools/EmbedImageModal.jsx',
  'src/components/editor/modals/ShortcutsDialog.jsx',
  'src/components/editor/modals/FindReplaceDialog.jsx',
  'src/components/editor/modals/SpellcheckDialog.jsx',
  'src/components/editor/DictaEditorCore.jsx',
  'src/components/editor/OfflineEditorApp.jsx',
];

const REACT_RUNTIME_PATHS = [
  ['scheduler', 'node_modules/scheduler/cjs/scheduler.production.js'],
  ['react', 'node_modules/react/cjs/react.production.js'],
  ['react-dom', 'node_modules/react-dom/cjs/react-dom.production.js'],
  ['react-dom/client', 'node_modules/react-dom/cjs/react-dom-client.production.js'],
  ['dompurify', 'node_modules/dompurify/dist/purify.cjs.js'],
];

const MATERIAL_SYMBOLS_GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

function escapeScriptTag(value) {
  return value.replace(/<\/script/gi, '<\\/script');
}

// `import { formatShortcut as formatKey }` מאבד את הקישור כששורת ה-import נמחקת:
// השם המקומי פשוט נעלם. כאן נשמר גשר מפורש בין השם המיוצא לשם המקומי.
function collectImportAliases(source) {
  const aliases = [];

  for (const [, specifiers] of source.matchAll(/^\s*import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?\s*$/gm)) {
    for (const specifier of specifiers.split(',')) {
      const match = specifier.trim().match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (match && match[1] !== match[2]) {
        aliases.push(`const ${match[2]} = ${match[1]};`);
      }
    }
  }

  return aliases;
}

function stripImportsAndExports(source) {
  return source
    .replace(/import\.meta\.url/g, 'location.href')
    .replace(/^\s*[\'\"]use client[\'\"];?\s*/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+[\'\"].*?[\'\"];?\s*$/gm, '')
    .replace(/^\s*import\s+[\'\"].*?[\'\"];?\s*$/gm, '')
    .replace(/export default function\s+/g, 'function ')
    .replace(/export default\s+([A-Za-z0-9_$]+);?/g, '')
    .replace(/export\s+(const|function|class|let|var)\s+/g, '$1 ')
    .replace(/export\s*\{[^}]*\};?/g, '');
}

// כל הקבצים משורשרים לסקופ אחד, ולכן שתי הצהרות עם אותו שם ברמת המודול נפגשות:
// `const` כפול הוא SyntaxError שמפיל את כל הסקריפט, ו-`function` כפול גרוע יותר —
// הוא לא זורק, פשוט דורס בשקט. לכן מי שהגיע ראשון שומר על השם (וכך הפניות
// חוצות-קבצים כמו Button או Modal ממשיכות לעבוד), וכל התנגשות אחריו מקבלת שם
// ייחודי לקובץ. זו בדיוק סמנטיקת המודול המקורית: השם ההוא היה מקומי מלכתחילה.
function moduleSuffixFor(filename) {
  return path.basename(filename).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_$]/g, '_');
}

function createRenameCollisionsPlugin(claimedNames, filename, renamed) {
  const suffix = moduleSuffixFor(filename);

  return function renameCollisionsPlugin() {
    return {
      visitor: {
        Program(programPath) {
          // snapshot: scope.rename משנה את bindings תוך כדי
          for (const name of Object.keys(programPath.scope.bindings)) {
            if (!claimedNames.has(name)) {
              claimedNames.set(name, filename);
              continue;
            }

            let candidate = `${name}$${suffix}`;
            let counter = 2;
            while (claimedNames.has(candidate) || programPath.scope.hasBinding(candidate)) {
              candidate = `${name}$${suffix}${counter++}`;
            }

            programPath.scope.rename(name, candidate);
            claimedNames.set(candidate, filename);
            renamed.push({ from: name, to: candidate, owner: claimedNames.get(name) });
          }
        },
      },
    };
  };
}

function transpileComponent(source, filename, claimedNames, renamed) {
  const aliases = collectImportAliases(source);
  const cleaned = [stripImportsAndExports(source), ...aliases].join('\n');
  const result = Babel.transformSync(cleaned, {
    filename,
    babelrc: false,
    configFile: false,
    comments: false,
    compact: false,
    sourceType: 'unambiguous',
    plugins: [createRenameCollisionsPlugin(claimedNames, filename, renamed)],
    presets: [[presetReact, { runtime: 'classic' }]],
  });

  return result && result.code ? result.code : cleaned;
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function isIconName(value) {
  return typeof value === 'string' && /^[a-z][a-z_]*$/.test(value);
}

function unionSets(...sets) {
  const merged = new Set();
  for (const set of sets) {
    if (!set) continue;
    for (const value of set) merged.add(value);
  }
  return merged;
}

function createScope(parent = null) {
  return {
    parent,
    bindings: new Map(),
  };
}

function getBinding(scope, name) {
  let current = scope;
  while (current) {
    if (current.bindings.has(name)) {
      return current.bindings.get(name);
    }
    current = current.parent;
  }
  return null;
}

function setBinding(scope, name, value) {
  if (!name || !value || value.size === 0) return;
  scope.bindings.set(name, value);
}

function getJsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') {
    const objectName = getJsxName(node.object);
    const propertyName = getJsxName(node.property);
    return objectName && propertyName ? `${objectName}.${propertyName}` : '';
  }
  return '';
}

function getAttributeValue(node) {
  if (!node) return null;

  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'Literal':
      return typeof node.value === 'string' ? node.value : null;
    case 'JSXExpressionContainer':
      if (!node.expression) return null;
      if (node.expression.type === 'StringLiteral') return node.expression.value;
      if (node.expression.type === 'Literal') {
        return typeof node.expression.value === 'string' ? node.expression.value : null;
      }
      return null;
    default:
      return null;
  }
}

function containsMaterialClass(valueNode) {
  if (!valueNode) return false;

  const direct = getAttributeValue(valueNode);
  if (typeof direct === 'string' && direct.includes('material-symbols-outlined')) {
    return true;
  }

  if (valueNode.type === 'JSXExpressionContainer' && valueNode.expression) {
    const expr = valueNode.expression;

    if (expr.type === 'TemplateLiteral') {
      const cooked = expr.quasis.map((q) => q.value.cooked || '').join(' ');
      if (cooked.includes('material-symbols-outlined')) {
        return true;
      }
    }

    if (expr.type === 'BinaryExpression' && expr.operator === '+') {
      const walk = (node) => {
        if (!node) return '';
        if (node.type === 'StringLiteral') return node.value || '';
        if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
        if (node.type === 'BinaryExpression' && node.operator === '+') {
          return `${walk(node.left)} ${walk(node.right)}`;
        }
        return '';
      };
      const flat = walk(expr);
      if (flat.includes('material-symbols-outlined')) {
        return true;
      }
    }
  }

  return false;
}

function expressionToIconSet(expression, scope, depth = 0) {
  if (!expression || depth > 8) return new Set();

  switch (expression.type) {
    case 'StringLiteral':
      return isIconName(expression.value) ? new Set([expression.value]) : new Set();
    case 'Literal':
      return typeof expression.value === 'string' && isIconName(expression.value)
        ? new Set([expression.value])
        : new Set();
    case 'TemplateLiteral': {
      if (expression.expressions.length > 0) return new Set();
      const value = expression.quasis.map((q) => q.value.cooked || '').join('');
      return isIconName(value) ? new Set([value]) : new Set();
    }
    case 'ConditionalExpression':
      return unionSets(
        expressionToIconSet(expression.consequent, scope, depth + 1),
        expressionToIconSet(expression.alternate, scope, depth + 1)
      );
    case 'LogicalExpression':
      return unionSets(
        expressionToIconSet(expression.left, scope, depth + 1),
        expressionToIconSet(expression.right, scope, depth + 1)
      );
    case 'SequenceExpression': {
      const last = expression.expressions[expression.expressions.length - 1];
      return expressionToIconSet(last, scope, depth + 1);
    }
    case 'ParenthesizedExpression':
      return expressionToIconSet(expression.expression, scope, depth + 1);
    case 'Identifier': {
      const binding = getBinding(scope, expression.name);
      return binding ? new Set(binding) : new Set();
    }
    default:
      return new Set();
  }
}

function collectIconsFromJsxElement(node, scope, usedIcons) {
  if (!node || node.type !== 'JSXElement') return;

  const attrs = node.openingElement?.attributes || [];
  let hasMaterialClass = false;

  for (const attr of attrs) {
    if (!attr || attr.type !== 'JSXAttribute') continue;
    const attrName = getJsxName(attr.name);
    if (attrName !== 'className' && attrName !== 'class') continue;
    if (containsMaterialClass(attr.value)) {
      hasMaterialClass = true;
      break;
    }
  }

  for (const attr of attrs) {
    if (!attr || attr.type !== 'JSXAttribute') continue;
    if (getJsxName(attr.name) !== 'icon') continue;

    if (attr.value?.type === 'StringLiteral') {
      if (isIconName(attr.value.value)) usedIcons.add(attr.value.value);
      continue;
    }

    if (attr.value?.type === 'JSXExpressionContainer') {
      const names = expressionToIconSet(attr.value.expression, scope);
      for (const name of names) usedIcons.add(name);
    }
  }

  if (hasMaterialClass) {
    for (const child of node.children || []) {
      if (!child) continue;

      if (child.type === 'JSXText') {
        const value = child.value.trim();
        if (isIconName(value)) usedIcons.add(value);
        continue;
      }

      if (child.type === 'JSXExpressionContainer') {
        const names = expressionToIconSet(child.expression, scope);
        for (const name of names) usedIcons.add(name);
      }
    }
  }
}

function traverseForIcons(node, scope, usedIcons) {
  if (!node || typeof node !== 'object') return;

  switch (node.type) {
    case 'File':
      traverseForIcons(node.program, scope, usedIcons);
      return;
    case 'Program':
      for (const statement of node.body || []) traverseForIcons(statement, scope, usedIcons);
      return;
    case 'BlockStatement': {
      const blockScope = createScope(scope);
      for (const statement of node.body || []) traverseForIcons(statement, blockScope, usedIcons);
      return;
    }
    case 'FunctionDeclaration': {
      if (node.id?.name) setBinding(scope, node.id.name, new Set());
      const fnScope = createScope(scope);
      for (const param of node.params || []) traverseForIcons(param, fnScope, usedIcons);
      traverseForIcons(node.body, fnScope, usedIcons);
      return;
    }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const fnScope = createScope(scope);
      for (const param of node.params || []) traverseForIcons(param, fnScope, usedIcons);
      traverseForIcons(node.body, fnScope, usedIcons);
      return;
    }
    case 'VariableDeclaration':
      for (const declaration of node.declarations || []) {
        if (declaration.id?.type === 'Identifier' && declaration.init) {
          const names = expressionToIconSet(declaration.init, scope);
          setBinding(scope, declaration.id.name, names);
        }
        traverseForIcons(declaration, scope, usedIcons);
      }
      return;
    case 'JSXElement':
      collectIconsFromJsxElement(node, scope, usedIcons);
      break;
    case 'ReturnStatement': {
      const names = expressionToIconSet(node.argument, scope);
      for (const name of names) usedIcons.add(name);
      break;
    }
    default:
      break;
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) traverseForIcons(item, scope, usedIcons);
    } else if (typeof value === 'object' && value.type) {
      traverseForIcons(value, scope, usedIcons);
    }
  }
}

// המניפסט של גופן האתר (scripts/icon-font.manifest.json) הוא רשימת שמות
// האייקונים שאושרו מול Google — שמור ב-Git, ולכן זמין ללא רשת.
const ICON_MANIFEST_PATH = path.join(ROOT_DIR, 'scripts', 'icon-font.manifest.json');

async function readIconUniverse() {
  try {
    const manifest = JSON.parse(await readTextFile(ICON_MANIFEST_PATH));
    return new Set(Array.isArray(manifest.icons) ? manifest.icons : []);
  } catch {
    return new Set();
  }
}

// כל token בקוד ששמו הוא שם אייקון מוכר. סריקה רחבה במכוון, בדיוק כמו
// build-icon-font.mjs: היא תופסת שמות שהסריקה המדויקת מפספסת — בעיקר שם שמועבר
// כארגומנט לפונקציית עזר, למשל toolButton('createHeaders', 'title', ...), שאינו
// לא prop בשם icon ולא טקסט בתוך span של material-symbols-outlined. אייקון כזה
// נעדר מה-subset ומוצג למשתמש כטקסט ("format_size" באמצע סרגל הכלים).
const ICON_TOKEN_RE = /[a-z][a-z0-9_]{2,}/g;

function collectIconTokens(source, universe, usedIcons) {
  if (universe.size === 0) return;
  for (const [token] of source.matchAll(ICON_TOKEN_RE)) {
    if (universe.has(token)) usedIcons.add(token);
  }
}

/**
 * Extracts Material Symbols icon names from source files using AST parsing.
 * This supports literals and common variable-based expressions (e.g. const x = 'settings').
 */
async function collectUsedIcons() {
  const usedIcons = new Set();
  const universe = await readIconUniverse();

  for (const relativePath of COMPONENT_PATHS) {
    const fullPath = path.join(ROOT_DIR, relativePath);
    let source;
    try {
      source = await readTextFile(fullPath);
    } catch {
      continue;
    }

    try {
      const ast = Babel.parseSync(source, {
        filename: relativePath,
        sourceType: 'unambiguous',
        babelrc: false,
        configFile: false,
        parserOpts: {
          plugins: ['jsx'],
          errorRecovery: true,
        },
      });

      if (!ast) continue;
      traverseForIcons(ast, createScope(), usedIcons);
    } catch (error) {
      console.warn(`[offline-editor] Icon scan parse failed for ${relativePath}: ${error.message}`);
      continue;
    }

    if (source.includes('material-symbols-outlined')) {
      for (const [, name] of source.matchAll(/\breturn\s+["']([a-z][a-z_]*)["']/g)) {
        if (isIconName(name)) usedIcons.add(name);
      }
    }

    collectIconTokens(source, universe, usedIcons);
  }

  return usedIcons;
}

// מטמון של ה-subset שהורד מ-Google, נשמר ב-Git. בלעדיו כל build היה דורש
// אינטרנט: בלי רשת הפונקציה מטה נכשלת אחרי שלושה ניסיונות וה-build כולו נופל.
const ICON_CACHE_PATH = path.join(ROOT_DIR, 'scripts', 'offline-editor-icons.json');

// רענון הגופן מ-Google הוא פעולה מפורשת, לא תופעת לוואי של build.
const SHOULD_REFRESH_ICONS =
  process.argv.includes('--refresh-icons') || process.env.REFRESH_EDITOR_ICONS === '1';

// timeout לכל בקשה ל-Google — חיבור תקוע לא יעכב את ה-build ללא הגבלה.
const ICON_FETCH_TIMEOUT_MS = 8_000;

async function readIconCache() {
  try {
    const cache = JSON.parse(await fs.readFile(ICON_CACHE_PATH, 'utf8'));
    return cache?.base64 ? cache : null;
  } catch {
    return null;
  }
}

// נכתב רק כשרשימת האייקונים השתנתה, כדי שלא כל build ילכלך את עץ העבודה.
async function writeIconCache(iconNames, asset) {
  const existing = await readIconCache();
  const sameIcons =
    existing && existing.icons.length === iconNames.length &&
    existing.icons.every((name, i) => name === iconNames[i]);
  if (sameIcons) return;

  await fs.writeFile(
    ICON_CACHE_PATH,
    `${JSON.stringify({ icons: iconNames, format: asset.format, bytes: asset.bytes, base64: asset.base64 }, null, 2)}\n`
  );
  console.log(`[offline-editor] Updated committed icon cache (${iconNames.length} icons)`);
}

async function buildGoogleMaterialSymbolsCss(usedIcons, retries = 3, delayMs = 2000) {
  const iconNames = [...usedIcons].sort();
  if (iconNames.length === 0) {
    return null;
  }

  const cached = await readIconCache();
  const cacheCoversAll = cached !== null && iconNames.every(name => cached.icons.includes(name));

  // מטמון מלא = אותו פלט בדיוק. אין שום סיבה שה-build יחכה לרשת בשביל תוצאה
  // זהה: גם כשל מיידי הוא סיכון (חיבור תקוע יכול לעכב שניות רבות). לכן ברירת
  // המחדל היא מטמון, ורענון מהרשת הוא פקודה מפורשת:  npm run refresh:editor-icons
  if (cacheCoversAll && !SHOULD_REFRESH_ICONS) {
    console.log(`[offline-editor] Using committed icon cache (${cached.icons.length} icons, no network)`);
    return renderMaterialSymbolsCss(cached);
  }

  const attempts = retries;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const asset = await _fetchGoogleMaterialSymbolsAsset(iconNames.join(','), usedIcons);
      await writeIconCache(iconNames, asset);
      return renderMaterialSymbolsCss(asset);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        console.warn(`[offline-editor] Google fonts attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // רענון מפורש שנכשל חייב להיכשל בקול. נפילה שקטה למטמון הייתה מסיימת ב-exit 0
  // ומשאירה את המפעיל (או אוטומציה) בהנחה שהמטמון רוענן, כשבפועל לא קרה דבר.
  if (SHOULD_REFRESH_ICONS) {
    throw new Error(
      `רענון האייקונים נכשל אחרי ${attempts} ניסיונות (${lastError.message}). ` +
      'המטמון לא עודכן.'
    );
  }

  // נפילה למטמון שנשמר ב-Git, כדי ש-build לא יהיה תלוי בזמינות Google.
  if (!cached) {
    throw new Error(
      `Google icon subset unavailable after ${attempts} attempt(s) (${lastError.message}) ` +
      'and no committed cache at scripts/offline-editor-icons.json'
    );
  }

  console.warn(`[offline-editor] Google unavailable (${lastError.message}) — using committed icon cache`);

  if (!cacheCoversAll) {
    const missing = iconNames.filter(name => !cached.icons.includes(name));
    const detail =
      `${missing.length} icons are missing from the cache and would render as text: ${missing.join(', ')}. ` +
      'Re-run with network access to refresh scripts/offline-editor-icons.json';

    // ב-CI זה כשל: ייצוא עורך שמציג "format_bold" כטקסט אינו משהו שכדאי לדפלוי
    // לעבור עליו בשקט. מקומית זו אזהרה, כדי לא לחסום עבודה ללא רשת.
    if (process.env.CI === 'true' || process.env.CI === '1') {
      throw new Error(detail);
    }
    console.warn(`[offline-editor] ⚠️  ${detail}`);
  }

  return renderMaterialSymbolsCss(cached);
}

async function _fetchGoogleMaterialSymbolsAsset(iconNames, usedIcons) {
  try {
    const cssUrl = `${MATERIAL_SYMBOLS_GOOGLE_CSS_URL}&icon_names=${encodeURIComponent(iconNames)}`;
    const cssResponse = await fetch(cssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS),
    });

    if (!cssResponse.ok) {
      throw new Error(`CSS request failed with ${cssResponse.status}`);
    }

    const googleCss = await cssResponse.text();
    const fontUrlMatch = googleCss.match(/src:\s*url\((https:[^)]+)\)\s*format\(['"]([^'"]+)['"]\)/);
    if (!fontUrlMatch) {
      throw new Error('subset font URL not found in Google CSS response');
    }

    const [, fontUrl, format] = fontUrlMatch;
    const fontResponse = await fetch(fontUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS),
    });

    if (!fontResponse.ok) {
      throw new Error(`font request failed with ${fontResponse.status}`);
    }

    const fontBuffer = Buffer.from(await fontResponse.arrayBuffer());

    console.log(
      `[offline-editor] Downloaded Google icon subset: ${fontBuffer.length} bytes ` +
      `(${usedIcons.size} icons)`
    );

    return { base64: fontBuffer.toString('base64'), format, bytes: fontBuffer.length };
  } catch (err) {
    throw err;
  }
}

function renderMaterialSymbolsCss({ base64, format }) {
  const mimeType = format === 'truetype' ? 'font/ttf' : `font/${format}`;
  return `
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("data:${mimeType};base64,${base64}") format("${format}");
}
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "liga";
}
`;
}

async function readRuntimeModules() {
  const modules = await Promise.all(
    REACT_RUNTIME_PATHS.map(async ([moduleId, relativePath]) => {
      const fullPath = path.join(ROOT_DIR, relativePath);
      const code = await readTextFile(fullPath);
      return { moduleId, code };
    })
  );

  return modules;
}

async function hasNextBuild() {
  try {
    await fs.access(path.join(ROOT_DIR, '.next'));
    return true;
  } catch {
    return false;
  }
}
async function collectCssFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return collectCssFiles(fullPath);
        }
        return entry.name.endsWith('.css') ? [fullPath] : [];
      })
    );

    return files.flat();
  } catch {
    return [];
  }
}

// icon-font.css של האתר מצהיר על אותה משפחה עם src ל-/fonts/... — נתיב שאינו קיים
// בקובץ HTML שהורד. ההצהרה הזאת מגיעה לכאן דרך שרשור ה-CSS מ-.next, דורסת את
// המשפחה של הגופן המוטמע, ומסתיימת ב-status: error. כרום נופל בחזרה למוטמע ולכן
// זה לא מפיל את האייקונים, אבל זו הסתמכות על התנהגות fallback — ובנוסף כל טעינה
// כזו היא בקשת רשת כושלת בעורך שאמור לעבוד ללא רשת.
function stripMaterialSymbolsFontFaces(css) {
  return css.replace(/@font-face\s*\{[^}]*\}/g, (rule) =>
    /font-family\s*:\s*['"]?Material Symbols Outlined['"]?/i.test(rule) && !rule.includes('data:')
      ? ''
      : rule
  );
}

async function readCurrentCssBundle() {
  const cssRoots = [
    path.join(ROOT_DIR, '.next', 'static', 'css'),
    path.join(ROOT_DIR, '.next', 'static', 'chunks'),
    path.join(ROOT_DIR, '.next', 'dev', 'static', 'chunks'),
  ];

  const cssFiles = (await Promise.all(cssRoots.map((root) => collectCssFiles(root))))
    .flat()
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();

  if (cssFiles.length === 0) {
    return '';
  }

  const cssContents = await Promise.all(
    cssFiles.map(async (filePath) => {
      const css = await readTextFile(filePath);
      return `/* ${path.basename(filePath)} */\n${stripMaterialSymbolsFontFaces(css)}`;
    })
  );

  return cssContents.filter(Boolean).join('\n\n');
}

async function buildMaterialSymbolsCss(usedIcons) {
  return buildGoogleMaterialSymbolsCss(usedIcons);
}

async function buildBundledComponents() {
  // הקריאה מקבילה, אבל ה-transpile סדרתי לפי סדר COMPONENT_PATHS: "הראשון שומר
  // על השם" חייב להיות דטרמיניסטי, אחרת ריצות שונות יניבו פלט שונה.
  const sources = await Promise.all(
    COMPONENT_PATHS.map((relativePath) => readTextFile(path.join(ROOT_DIR, relativePath)))
  );

  const claimedNames = new Map(PRELUDE_BINDINGS.map((name) => [name, '<prelude>']));
  const renamed = [];
  const chunks = [];

  for (let i = 0; i < COMPONENT_PATHS.length; i++) {
    const relativePath = COMPONENT_PATHS[i];
    const code = transpileComponent(sources[i], relativePath, claimedNames, renamed);
    chunks.push(`/* --- ${relativePath} --- */\n${code}`);
  }

  if (renamed.length > 0) {
    console.log(`[offline-editor] Renamed ${renamed.length} colliding module-level name(s):`);
    for (const { from, to, owner } of renamed) {
      console.log(`  ${from} -> ${to} (already declared by ${owner})`);
    }
  }

  return chunks.join('\n\n');
}

// גלובלים לגיטימיים של הדפדפן/השפה. כל שם אחר שהקוד שלנו מפנה אליו בלי שהוגדר
// בבנדל הוא ReferenceError בזמן ריצה — כלומר עורך שנפתח כדף לבן.
const ALLOWED_BROWSER_GLOBALS = new Set([
  // Babel רושם arguments כגלובל, אך הוא מופיע רק בתוך פונקציות עזר שהוא עצמו מייצר
  'arguments',
  'globalThis', 'window', 'document', 'navigator', 'location', 'history', 'screen', 'console',
  'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'AbortController', 'AbortSignal',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'structuredClone',
  'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams', 'Image', 'Audio',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'DOMParser', 'XMLSerializer',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'Node', 'NodeFilter', 'Element', 'HTMLElement', 'Range', 'Selection', 'DocumentFragment',
  'crypto', 'performance', 'atob', 'btoa', 'TextEncoder', 'TextDecoder', 'ClipboardItem',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Symbol', 'BigInt',
  'Math', 'JSON', 'Date', 'RegExp', 'Promise', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Proxy',
  'Reflect', 'Intl', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity', 'undefined',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView',
]);

/**
 * מוודא שכל שם שהקוד שלנו מפנה אליו באמת קיים בבנדל. זו הרשת שתופסת ייבוא חדש
 * שנמחק ולא סופק בפרולוג — הכשל שהפיל את העורך האופליין בעבר בלי שאף build התלונן.
 */
function validateBundleReferences(bundledComponents, appCode) {
  const code = `${bundledComponents}\n\n${appCode}`;
  let globals = [];

  Babel.transformSync(code, {
    filename: 'offline-bundle.js',
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    plugins: [
      function collectGlobals() {
        return {
          visitor: {
            Program(programPath) {
              globals = Object.keys(programPath.scope.globals);
            },
          },
        };
      },
    ],
  });

  const preludeNames = new Set(PRELUDE_BINDINGS);
  const missing = globals
    .filter((name) => !preludeNames.has(name) && !ALLOWED_BROWSER_GLOBALS.has(name))
    .sort();

  if (missing.length > 0) {
    throw new Error(
      `העורך האופליין מפנה ל-${missing.length} שמות שאינם מוגדרים בבנדל: ${missing.join(', ')}.\n` +
      'כל אחד מהם יזרוק ReferenceError וישאיר את העורך כדף לבן. הוסף אותם לפרולוג ' +
      '(buildModuleLoader) אם הם מגיעים מייבוא, או ל-ALLOWED_BROWSER_GLOBALS אם הם גלובל תקני.'
    );
  }
}

function buildAppSource() {
  return [
    "const offlineRoot = ReactDOMClient.createRoot(document.getElementById('root'));",
    'offlineRoot.render(React.createElement(OfflineEditorApp));',
  ].join('\n');
}

// שורות ה-import נמחקות, ולכן כל מה שהקומפוננטות מייבאות מ-react חייב להיות
// מסופק כאן. רשימה קשיחה נשברת בשקט בכל הוק חדש (useDeferredValue היה בדיוק זה:
// הוא נוסף לעורך, לא היה בפרולוג, והתוצאה הייתה ReferenceError בזמן ריצה), ולכן
// היא נגזרת מהייצוא האמיתי של React בזמן ה-build.
function reactHookNames() {
  const names = Object.keys(require('react'))
    .filter((name) => /^use[A-Z]/.test(name))
    .sort();

  if (names.length === 0) {
    throw new Error('לא נמצאו הוקים בייצוא של react — בדוק את התקנת node_modules');
  }

  return names;
}

const REACT_EXTRA_BINDINGS = ['createContext'];
const REACT_DOM_BINDINGS = ['createPortal'];
const RUNTIME_BINDINGS = [
  '__offlineModules',
  '__offlineCache',
  '__offlineRequire',
  'React',
  'ReactDOM',
  'ReactDOMClient',
  'DOMPurify',
  'AnimatePresence',
  'motion',
  'Link',
  'offlineRoot',
];

// כל השמות שהפרולוג מגדיר. משמש גם לשינוי שם של הצהרה בקומפוננטה שמתנגשת בהם,
// וגם כרשימת ההיתר של הוולידציה בהמשך.
const PRELUDE_BINDINGS = [
  ...RUNTIME_BINDINGS,
  ...reactHookNames(),
  ...REACT_EXTRA_BINDINGS,
  ...REACT_DOM_BINDINGS,
];

function buildModuleLoader(runtimeModules) {
  const moduleEntries = runtimeModules
    .map(({ moduleId, code }) => {
      const safeCode = escapeScriptTag(code);
      return `"${moduleId}": function(module, exports, require) {\n${safeCode}\n}`;
    })
    .join(',\n');

  return `
const __offlineModules = {
${moduleEntries}
};
const __offlineCache = {};
function __offlineRequire(moduleId) {
  if (__offlineCache[moduleId]) {
    return __offlineCache[moduleId].exports;
  }
  const factory = __offlineModules[moduleId];
  if (!factory) {
    throw new Error('Missing module: ' + moduleId);
  }
  const module = { exports: {} };
  __offlineCache[moduleId] = module;
  factory(module, module.exports, __offlineRequire);
  return module.exports;
}
const React = __offlineRequire('react');
const ReactDOM = __offlineRequire('react-dom');
const ReactDOMClient = __offlineRequire('react-dom/client');
const DOMPurify = __offlineRequire('dompurify');
const { ${[...reactHookNames(), ...REACT_EXTRA_BINDINGS].join(', ')} } = React;
const { ${REACT_DOM_BINDINGS.join(', ')} } = ReactDOM;
const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);
const motion = new Proxy({}, { get: (_, tag) => (props) => React.createElement(tag, props, props && props.children) });
// אין ניווט אופליין — Link של next הופך לעוגן רגיל (Button מרנדר אותו כש-href מועבר)
const Link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
`;
}

async function buildOfflineEditor() {
  const hasBuild = await hasNextBuild();
  if (!hasBuild) {
    console.log('Offline editor build skipped: .next directory not found.');
    return;
  }

  const usedIcons = await collectUsedIcons();
  console.log(`[offline-editor] Found ${usedIcons.size} used icons:`, [...usedIcons].sort().join(', '));

  const [runtimeModules, bundledComponents, appCode, materialSymbolsCss, cssBundle] = await Promise.all([
    readRuntimeModules(),
    buildBundledComponents(),
    Promise.resolve(buildAppSource()),
    buildMaterialSymbolsCss(usedIcons),
    readCurrentCssBundle(),
  ]);

  if (!cssBundle.trim()) {
    console.log('Offline editor build skipped: CSS bundle not ready yet.');
    return;
  }

  validateBundleReferences(bundledComponents, appCode);

  const moduleLoader = buildModuleLoader(runtimeModules);
  const inlineScript = [moduleLoader, bundledComponents, appCode].map(escapeScriptTag).join('\n\n');
  const inlineCss = [
    materialSymbolsCss,
    cssBundle,
    `html, body, #root { min-height: 100%; } body { margin: 0; } body::before { background-image: none !important; content: none !important; }`,
  ].join('\n\n');

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>עורך אופליין - אוצריא</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%93%9A%3C/text%3E%3C/svg%3E" />
    <style>${inlineCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${inlineScript}</script>
  </body>
</html>`;

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, html, 'utf8');
}

buildOfflineEditor()
  .then(() => {
    console.log(`Offline editor generated at ${OUTPUT_PATH}`);
  })
  .catch((error) => {
    console.error('Failed to generate offline editor', error);
    process.exitCode = 1;
  });
