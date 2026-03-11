import * as Babel from '@babel/core';
import presetReact from '@babel/preset-react';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

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
  'src/components/editor/OfflineEditorApp.jsx',
];

const REACT_RUNTIME_PATHS = [
  ['scheduler', 'node_modules/scheduler/cjs/scheduler.production.js'],
  ['react', 'node_modules/react/cjs/react.production.js'],
  ['react-dom', 'node_modules/react-dom/cjs/react-dom.production.js'],
  ['react-dom/client', 'node_modules/react-dom/cjs/react-dom-client.production.js'],
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

function getRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorName: 'UnknownError',
    errorMessage: typeof error === 'string' ? error : 'Unknown error',
    errorStack: undefined,
  };
}

function logExport(
  requestId: string,
  level: 'log' | 'warn' | 'error',
  message: string,
  data: Record<string, unknown> = {}
) {
  const payload = {
    requestId,
    ...data,
    message,
  };

  if (level === 'error') {
    console.error('[export-editor]', payload);
    return;
  }

  if (level === 'warn') {
    console.warn('[export-editor]', payload);
    return;
  }

  console.log('[export-editor]', payload);
}

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

async function readTextFile(filePath: string, requestId?: string, context?: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (requestId) {
      logExport(requestId, 'error', 'Failed to read text file', {
        context,
        filePath,
        ...normalizeError(error),
      });
    }

    throw error;
  }
}

async function readRuntimeModules(requestId: string) {
  const modules = await Promise.all(
    REACT_RUNTIME_PATHS.map(async ([moduleId, relativePath]) => {
      const fullPath = path.join(ROOT_DIR, relativePath);
      try {
        const code = await readTextFile(fullPath, requestId, 'react-runtime');
        return { moduleId, code };
      } catch (error) {
        logExport(requestId, 'error', 'Failed to load runtime module', {
          moduleId,
          relativePath,
          fullPath,
          ...normalizeError(error),
        });
        throw error;
      }
    })
  );

  return modules;
}

async function collectCssFiles(dirPath: string, requestId?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return collectCssFiles(fullPath, requestId);
        }
        return entry.name.endsWith('.css') ? [fullPath] : [];
      })
    );

    return files.flat();
  } catch (error) {
    if (requestId) {
      logExport(requestId, 'warn', 'Failed to scan CSS directory', {
        dirPath,
        ...normalizeError(error),
      });
    }

    return [];
  }
}

async function readCurrentCssBundle(requestId: string) {
  const cssRoots = [
    path.join(ROOT_DIR, '.next', 'static', 'css'),
    path.join(ROOT_DIR, '.next', 'static', 'chunks'),
    path.join(ROOT_DIR, '.next', 'dev', 'static', 'chunks'),
  ];

  logExport(requestId, 'log', 'Collecting CSS bundle', { cssRoots });

  const cssFiles = (await Promise.all(cssRoots.map((root) => collectCssFiles(root, requestId))))
    .flat()
    .filter((filePath, index, all) => all.indexOf(filePath) === index)
    .sort();

  if (cssFiles.length === 0) {
    logExport(requestId, 'warn', 'No CSS files found for offline bundle', { cssRoots });
  } else {
    logExport(requestId, 'log', 'CSS files collected', { cssFileCount: cssFiles.length });
  }

  const cssContents = await Promise.all(
    cssFiles.map(async (filePath) => {
      try {
        const css = await readTextFile(filePath, requestId, 'css-bundle');
        return `/* ${path.basename(filePath)} */\n${css}`;
      } catch (error) {
        logExport(requestId, 'warn', 'Failed to read CSS file; skipping', {
          filePath,
          ...normalizeError(error),
        });
        return '';
      }
    })
  );

  return cssContents.filter(Boolean).join('\n\n');
}

async function buildMaterialSymbolsCss(requestId: string) {
  for (const candidate of MATERIAL_SYMBOLS_ASSET_CANDIDATES) {
    try {
      const [fontBuffer, cssTemplate] = await Promise.all([
        fs.readFile(path.join(ROOT_DIR, candidate.fontPath)),
        readTextFile(path.join(ROOT_DIR, candidate.cssPath), requestId, 'material-symbols-css'),
      ]);

      const fontBase64 = fontBuffer.toString('base64');
      logExport(requestId, 'log', 'Material Symbols CSS embedded', {
        fontPath: candidate.fontPath,
        cssPath: candidate.cssPath,
      });

      return cssTemplate.replace('./material-symbols-outlined.woff2', `data:font/woff2;base64,${fontBase64}`);
    } catch (error) {
      logExport(requestId, 'warn', 'Material Symbols candidate failed', {
        fontPath: candidate.fontPath,
        cssPath: candidate.cssPath,
        ...normalizeError(error),
      });
      continue;
    }
  }

  logExport(requestId, 'warn', 'Material Symbols assets not found; using fallback CSS');

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

async function buildBundledComponents(requestId: string) {
  const sources = await Promise.all(
    COMPONENT_PATHS.map(async (relativePath) => {
      const fullPath = path.join(ROOT_DIR, relativePath);
      try {
        const source = await readTextFile(fullPath, requestId, 'component-source');
        const code = transpileComponent(source, relativePath);
        return `/* --- ${relativePath} --- */\n${code}`;
      } catch (error) {
        logExport(requestId, 'error', 'Failed to bundle component', {
          relativePath,
          fullPath,
          ...normalizeError(error),
        });
        throw error;
      }
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
const React = __offlineRequire('react');
const ReactDOM = __offlineRequire('react-dom');
const ReactDOMClient = __offlineRequire('react-dom/client');
const { useState, useEffect, useRef, useMemo, useCallback, useContext, useTransition, createContext } = React;
const { createPortal } = ReactDOM;
`;
}

export async function GET(request: Request) {
  const requestId = getRequestId();
  const startedAt = Date.now();

  logExport(requestId, 'log', 'Export editor request started', {
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer'),
  });

  try {
    const [runtimeModules, bundledComponents, appCode, materialSymbolsCss, cssBundle] = await Promise.all([
      readRuntimeModules(requestId),
      buildBundledComponents(requestId),
      Promise.resolve(buildAppSource()),
      buildMaterialSymbolsCss(requestId),
      readCurrentCssBundle(requestId),
    ]);

    const moduleLoader = buildModuleLoader(runtimeModules);
    const inlineScript = [moduleLoader, bundledComponents, appCode].map(escapeScriptTag).join('\n\n');
    const inlineCss = [
      materialSymbolsCss,
      cssBundle,
      `html, body, #root { min-height: 100%; } body { margin: 0; } body::before { background-image: none !important; content: none !important; }`,
    ].join('\n\n');

    logExport(requestId, 'log', 'Export editor bundle built', {
      runtimeModuleCount: runtimeModules.length,
      componentCount: COMPONENT_PATHS.length,
      inlineCssBytes: inlineCss.length,
      inlineScriptBytes: inlineScript.length,
      cssBundleBytes: cssBundle.length,
    });

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

    const response = new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename=dicta-editor-offline.html',
        'Cache-Control': 'no-store',
        'X-Export-Editor-Request-Id': requestId,
      },
    });

    logExport(requestId, 'log', 'Export editor request completed', {
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    logExport(requestId, 'error', 'Export editor request failed', {
      durationMs: Date.now() - startedAt,
      ...normalizeError(error),
    });

    return new NextResponse(`Export editor failed. requestId=${requestId}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Export-Editor-Request-Id': requestId,
      },
    });
  }
}
