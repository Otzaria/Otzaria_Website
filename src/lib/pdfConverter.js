// Uploads/storage are supplied by the live installation, not bundled build assets.
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';
import { convertPdfToImagesRaw } from './pdfRendererRaw.js';
import path from 'path';
import { pathToFileURL } from 'node:url';

const pdfjsWasmUrl = pathToFileURL(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'wasm') + path.sep).href;

const DEFAULT_OPTIONS = {
  width: 1200,
  height: 1600,
  scale: 2.0,
  quality: 85,
  filenamePrefix: 'page',
};

export async function convertPdfToImagesLegacy(pdfSource, outputFolder, options = {}) {
  const { width, height, scale, quality, filenamePrefix } = { ...DEFAULT_OPTIONS, ...options };

  const document = await pdf(pdfSource, {
    scale,
    docInitParams: {
      wasmUrl: pdfjsWasmUrl,
      isEvalSupported: false,
    },
  });
  const pages = [];
  let pageNumber = 0;

  try {
    for await (const pngBuffer of document) {
      pageNumber++;
      const outputPath = path.join(/*turbopackIgnore: true*/ outputFolder, `${filenamePrefix}.${pageNumber}.jpg`);
      await sharp(pngBuffer)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toFile(outputPath);
      pages.push({ page: pageNumber, path: outputPath });
    }
    return pages;
  } finally {
    // pdf-to-img 7 requires explicit release of the PDF.js worker/document,
    // including when rendering or writing one of the images fails.
    await document.destroy();
  }
}


/**
 * Convert a PDF into page.N.jpg files, preserving the public output contract.
 * Set PDF_CONVERTER_RENDERER=legacy for operational rollback, or pass
 * { renderer: 'legacy' } for a single controlled conversion/benchmark.
 * The default RGBA path is bounded across concurrent requests.
 */
export async function convertPdfToImages(pdfSource, outputFolder, options = {}) {
  if (options?.renderer === 'legacy' || process.env.PDF_CONVERTER_RENDERER === 'legacy') {
    return convertPdfToImagesLegacy(pdfSource, outputFolder, options);
  }
  return convertPdfToImagesRaw(pdfSource, outputFolder, { ...DEFAULT_OPTIONS, ...options });
}
