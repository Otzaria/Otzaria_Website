import { pdf } from 'pdf-to-img';
import sharp from 'sharp';
import path from 'path';
import { createRequire } from 'node:module';

const pdfjsPath = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

const DEFAULT_OPTIONS = {
  width: 1200,
  height: 1600,
  scale: 2.0,
  quality: 85,
  filenamePrefix: 'page',
};

export async function convertPdfToImages(pdfSource, outputFolder, options = {}) {
  const { width, height, scale, quality, filenamePrefix } = { ...DEFAULT_OPTIONS, ...options };

  const document = await pdf(pdfSource, {
    scale,
    docInitParams: {
      wasmUrl: path.join(pdfjsPath, 'wasm/'),
    },
  });
  const pages = [];
  let pageNumber = 0;

  for await (const pngBuffer of document) {
    pageNumber++;
    const outputPath = path.join(outputFolder, `${filenamePrefix}.${pageNumber}.jpg`);
    await sharp(pngBuffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toFile(outputPath);
    pages.push({ page: pageNumber, path: outputPath });
  }

  return pages;
}
