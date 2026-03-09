import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { promises as fs } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const BabelBundle = require('next/dist/compiled/babel/bundle.js');
const Babel = BabelBundle.core();
const presetReact = BabelBundle.presetReact().default;

const ROOT_DIR = process.cwd();
const COMPONENT_PATHS = [
  'src/lib/avatar-colors.js',
  'src/components/DialogContext.jsx',
  'src/components/Modal.jsx',
  'src/components/FormInput.jsx',
  'src/components/Button.jsx',
  'src/components/LoadingSpinner.jsx',
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
  'src/components/editor/DictaEditorCore.jsx',
];

const REACT_RUNTIME_PATHS = [
  ['next/dist/compiled/scheduler', 'node_modules/next/dist/compiled/scheduler/cjs/scheduler.production.js'],
  ['next/dist/compiled/react', 'node_modules/next/dist/compiled/react/cjs/react.production.js'],
  ['next/dist/compiled/react-dom', 'node_modules/next/dist/compiled/react-dom/cjs/react-dom.production.js'],
  ['next/dist/compiled/react-dom/client', 'node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js'],
];

const MATERIAL_SYMBOLS_ASSET_CANDIDATES = [
  {
    fontPath: 'public/export-editor/material-symbols/material-symbols-outlined.woff2',
    cssPath: 'public/export-editor/material-symbols/outlined.css',
  },
  {
    fontPath: 'node_modules/material-symbols/material-symbols-outlined.woff2',
    cssPath: 'node_modules/material-symbols/outlined.css',
  },
];

function escapeScriptTag(value: string) {
  return value.replace(/<\/script/gi, '<\\/script');
}

function stripImportsAndExports(source: string) {
  return source
    .replace(/^\s*['\"]use client['\"];?\s*/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+['\"].*?['\"];?\s*$/gm, '')
    .replace(/^\s*import\s+['\"].*?['\"];?\s*$/gm, '')
    .replace(/export default function\s+/g, 'function ')
    .replace(/export default\s+([A-Za-z0-9_$]+);?/g, '')
    .replace(/export\s+(const|function|class|let|var)\s+/g, '$1 ')
    .replace(/export\s*\{[^}]*\};?/g, '');
}

function transpileComponent(source: string, filename: string) {
  const cleaned = stripImportsAndExports(source);
  const result = Babel.transformSync(cleaned, {
    filename,
    babelrc: false,
    configFile: false,
    comments: false,
    compact: false,
    sourceType: 'script',
    presets: [[presetReact, { runtime: 'classic' }]],
  });

  return result?.code ?? cleaned;
}

async function readTextFile(filePath: string) {
  return fs.readFile(filePath, 'utf8');
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

async function collectCssFiles(dirPath: string): Promise<string[]> {
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
    path.join(ROOT_DIR, '.next', 'dev', 'static', 'chunks'),
  ];

  const cssFiles = (await Promise.all(cssRoots.map(collectCssFiles)))
    .flat()
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();

  const cssContents = await Promise.all(
    cssFiles.map(async (filePath) => {
      const css = await readTextFile(filePath);
      return `/* ${path.basename(filePath)} */\n${css}`;
    })
  );

  return cssContents.join('\n\n');
}

async function buildMaterialSymbolsCss() {
  for (const candidate of MATERIAL_SYMBOLS_ASSET_CANDIDATES) {
    try {
      const [fontBuffer, cssTemplate] = await Promise.all([
        fs.readFile(path.join(ROOT_DIR, candidate.fontPath)),
        readTextFile(path.join(ROOT_DIR, candidate.cssPath)),
      ]);

      const fontBase64 = fontBuffer.toString('base64');
      return cssTemplate.replace('./material-symbols-outlined.woff2', `data:font/woff2;base64,${fontBase64}`);
    } catch {
      continue;
    }
  }

  return `
.material-symbols-outlined {
  font-family: inherit;
  font-weight: 400;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  direction: ltr;
}
`;
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
  const appSource = `
function OfflineEditorApp() {
  const [localContent, setLocalContent] = useState('');
  const [fileName, setFileName] = useState('קובץ_אופליין_חדש.txt');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setLocalContent(loadEvent.target.result);
      setHasUnsavedChanges(false);
    };
    reader.readAsText(file);
  };

  const handleSaveToLocalFile = (currentContent) => {
    const blob = new Blob([currentContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setLocalContent(currentContent);
    setHasUnsavedChanges(false);
  };

  const headerStart = (
    <>
      <input
        type="file"
        accept=".txt,.html"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <Button
        icon="folder_open"
        variant="ghost"
        onClick={() => fileInputRef.current?.click()}
        label="פתח קובץ"
      />
      <Button
        icon="download"
        variant="primary"
        onClick={() => handleSaveToLocalFile(localContent)}
        label="שמור קובץ"
      />
      <div className="w-px h-8 bg-surface-variant mx-2"></div>
    </>
  );

  const headerEnd = (
    <div className="text-sm text-gray-500 font-medium">מצב עבודה אופליין</div>
  );

  return (
    <DialogProvider>
      <DictaEditorCore
        initialContent={localContent}
        title={fileName}
        canEdit={true}
        isCompleted={false}
        onSave={handleSaveToLocalFile}
        hasUnsavedChangesOuter={hasUnsavedChanges}
        setHasUnsavedChanges={setHasUnsavedChanges}
        headerStartElement={headerStart}
        headerEndElement={headerEnd}
        singleLineHeader={true}
      />
    </DialogProvider>
  );
}

const offlineRoot = ReactDOMClient.createRoot(document.getElementById('root'));
offlineRoot.render(<OfflineEditorApp />);
`;

  return transpileComponent(appSource, 'offline-editor-app.jsx');
}

function buildModuleLoader(runtimeModules: { moduleId: string; code: string }[]) {
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
const React = __offlineRequire('next/dist/compiled/react');
const ReactDOM = __offlineRequire('next/dist/compiled/react-dom');
const ReactDOMClient = __offlineRequire('next/dist/compiled/react-dom/client');
const { useState, useEffect, useRef, useMemo, useCallback, useContext, useTransition, createContext } = React;
const { createPortal } = ReactDOM;
`;
}

export async function GET() {
  const [runtimeModules, bundledComponents, appCode, materialSymbolsCss, cssBundle] = await Promise.all([
    readRuntimeModules(),
    buildBundledComponents(),
    Promise.resolve(buildAppSource()),
    buildMaterialSymbolsCss(),
    readCurrentCssBundle(),
  ]);

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

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename=dicta-editor-offline.html',
      'Cache-Control': 'no-store',
    },
  });
}







