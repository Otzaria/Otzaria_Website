const fs = require('fs/promises');
const path = require('path');
const Babel = require('@babel/core');
const presetReact = require('@babel/preset-react');

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'export-editor', 'dicta-editor-offline.html');

const COMPONENT_PATHS = [
  'src/lib/avatar-colors.js',
  'src/components/DialogContext.jsx',
  'src/components/Modal.jsx',
  'src/components/FormInput.jsx',
  'src/components/Button.jsx',
  'src/components/LoadingSpinner.jsx',
  'src/components/LoadingContext.jsx',
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
];

const MATERIAL_SYMBOLS_GOOGLE_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

function escapeScriptTag(value) {
  return value.replace(/<\/script/gi, '<\\/script');
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

function transpileComponent(source, filename) {
  const cleaned = stripImportsAndExports(source);
  const result = Babel.transformSync(cleaned, {
    filename,
    babelrc: false,
    configFile: false,
    comments: false,
    compact: false,
    sourceType: 'unambiguous',
    presets: [[presetReact, { runtime: 'classic' }]],
  });

  return result && result.code ? result.code : cleaned;
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

/**
 * Scans each bundled component file and extracts the names of every
 * Material Symbols icon that is actually used, so the font can be subsetted.
 *
 * Handles three patterns:
 *   1. Static text children of .material-symbols-outlined spans
 *   2. String literals inside icon= props (including ternary expressions)
 *   3. return 'icon_name' statements in files that use material-symbols
 */
async function collectUsedIcons() {
  const usedIcons = new Set();
  const iconNameRe = /^[a-z][a-z_]*$/;

  for (const relativePath of COMPONENT_PATHS) {
    const fullPath = path.join(ROOT_DIR, relativePath);
    let source;
    try {
      source = await readTextFile(fullPath);
    } catch {
      continue;
    }

    // 1. Content of every material-symbols-outlined span element.
    //    Split on each occurrence of the class name, grab everything between
    //    the first '>' and the first '<' that follows it.
    const parts = source.split('material-symbols-outlined');
    for (let i = 1; i < parts.length; i++) {
      const afterClass = parts[i];
      const gtIdx = afterClass.indexOf('>');
      if (gtIdx === -1) continue;
      const afterGt = afterClass.slice(gtIdx + 1);
      const ltIdx = afterGt.indexOf('<');
      if (ltIdx === -1) continue;
      const content = afterGt.slice(0, ltIdx).trim();

      if (iconNameRe.test(content)) {
        // Plain static icon name
        usedIcons.add(content);
      } else {
        // For expressions, only keep quoted values that are rendered as icon outputs.
        // This avoids collecting condition strings such as "confirm".
        const ternaryOutputs = content.matchAll(/\?\s*["']([a-z][a-z_]*)["']\s*:\s*["']([a-z][a-z_]*)["']/g);
        let foundTernary = false;
        for (const match of ternaryOutputs) {
          foundTernary = true;
          usedIcons.add(match[1]);
          usedIcons.add(match[2]);
        }

        if (!foundTernary) {
          const directValue = content.match(/^\{?\s*["']([a-z][a-z_]*)["']\s*\}?$/);
          if (directValue) {
            usedIcons.add(directValue[1]);
          }
        }
      }
    }

    // 2. icon= prop: static ("name"), dynamic ({expr}) and ternary forms
    const iconPropRe = /\bicon=(?:"([a-z][a-z_]*)"|'([a-z][a-z_]*)'|\{([^}]+)\})/g;
    for (const match of source.matchAll(iconPropRe)) {
      if (match[1]) {
        usedIcons.add(match[1]);
      } else if (match[2]) {
        usedIcons.add(match[2]);
      } else if (match[3]) {
        const expression = match[3].trim();
        const directValue = expression.match(/^["']([a-z][a-z_]*)["']$/);
        if (directValue) {
          usedIcons.add(directValue[1]);
          continue;
        }

        const ternaryOutputs = expression.matchAll(/\?\s*["']([a-z][a-z_]*)["']\s*:\s*["']([a-z][a-z_]*)["']/g);
        for (const ternary of ternaryOutputs) {
          usedIcons.add(ternary[1]);
          usedIcons.add(ternary[2]);
        }
      }
    }

    // 3. return 'icon_name' in files that render material-symbols icons.
    //    Catches helper functions like getIcon() { switch(...) { return 'list_alt' } }
    if (source.includes('material-symbols-outlined')) {
      for (const [, name] of source.matchAll(/\breturn\s+["']([a-z][a-z_]*)["']/g)) {
        usedIcons.add(name);
      }
    }
  }

  return usedIcons;
}

async function buildGoogleMaterialSymbolsCss(usedIcons) {
  const iconNames = [...usedIcons].sort().join(',');
  if (!iconNames) {
    return null;
  }

  try {
    const cssUrl = `${MATERIAL_SYMBOLS_GOOGLE_CSS_URL}&icon_names=${encodeURIComponent(iconNames)}`;
    const cssResponse = await fetch(cssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!cssResponse.ok) {
      throw new Error(`CSS request failed with ${cssResponse.status}`);
    }

    const googleCss = await cssResponse.text();
    const fontUrlMatch = googleCss.match(/src:\s*url\((https:[^)]+)\)\s*format\('([^']+)'\)/);
    if (!fontUrlMatch) {
      throw new Error('subset font URL not found in Google CSS response');
    }

    const [, fontUrl, format] = fontUrlMatch;
    const fontResponse = await fetch(fontUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!fontResponse.ok) {
      throw new Error(`font request failed with ${fontResponse.status}`);
    }

    const fontBuffer = Buffer.from(await fontResponse.arrayBuffer());
    const mimeType = format === 'truetype' ? 'font/ttf' : `font/${format}`;
    const fontBase64 = fontBuffer.toString('base64');

    console.log(
      `[offline-editor] Downloaded Google icon subset: ${fontBuffer.length} bytes ` +
      `(${usedIcons.size} icons)`
    );

    return `
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("data:${mimeType};base64,${fontBase64}") format("${format}");
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
  } catch (err) {
    throw new Error(`Google icon subset unavailable: ${err.message}`);
  }
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
      return `/* ${path.basename(filePath)} */\n${css}`;
    })
  );

  return cssContents.filter(Boolean).join('\n\n');
}

async function buildMaterialSymbolsCss(usedIcons) {
  return buildGoogleMaterialSymbolsCss(usedIcons);
}

async function buildBundledComponents() {
  const sources = await Promise.all(
    COMPONENT_PATHS.map(async (relativePath) => {
      const fullPath = path.join(ROOT_DIR, relativePath);
      const source = await readTextFile(fullPath);
      const code = transpileComponent(source, relativePath);
      return `/* --- ${relativePath} --- */\n${code}`;
    })
  );

  return sources.join('\n\n');
}

function buildAppSource() {
  return [
    "const offlineRoot = ReactDOMClient.createRoot(document.getElementById('root'));",
    'offlineRoot.render(React.createElement(OfflineEditorApp));',
  ].join('\n');
}

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
const { useState, useEffect, useRef, useMemo, useCallback, useContext, useTransition, createContext } = React;
const { createPortal } = ReactDOM;\nconst AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);\nconst motion = new Proxy({}, { get: (_, tag) => (props) => React.createElement(tag, props, props && props.children) });
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
