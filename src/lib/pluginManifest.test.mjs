import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { listPluginEntries, readManifestFromPlugin } from './pluginManifest.js';

// בונה ZIP מינימלי בכתיבה ידנית, כדי שהבדיקה לא תישען על ספריית דחיסה.
// תומך בשתי שיטות הדחיסה שהקורא מכיר: 0 (stored) ו-8 (deflate). ה-CRC נשאר 0
// במכוון — הקורא אינו מאמת אותו, וזיוף היה מסתיר את העובדה הזאת.
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, content, method = 0 } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content ?? '', 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

const MANIFEST = { id: 'com.example.plugin', version: '1.2.3', name: 'דוגמה' };

test('קריאת manifest.json מרשומה דחוסה ומרשומה שאינה דחוסה', () => {
  for (const method of [0, 8]) {
    const zip = buildZip([
      { name: 'index.html', content: '<h1>שלום</h1>', method },
      { name: 'manifest.json', content: JSON.stringify(MANIFEST), method },
    ]);
    assert.deepEqual(readManifestFromPlugin(zip), MANIFEST, `method ${method}`);
  }
});

test('BOM בתחילת המניפסט אינו מפיל את הקריאה', () => {
  const zip = buildZip([{ name: 'manifest.json', content: '\uFEFF' + JSON.stringify(MANIFEST) }]);
  assert.deepEqual(readManifestFromPlugin(zip), MANIFEST);
});

test('רשימת הרשומות נושאת שם וגודל לא-דחוס, ומדלגת על תיקיות', () => {
  const zip = buildZip([
    { name: 'js/', content: '' },
    { name: 'js/app.js', content: 'x'.repeat(100), method: 8 },
    { name: 'manifest.json', content: JSON.stringify(MANIFEST) },
  ]);
  assert.deepEqual(listPluginEntries(zip), [
    { name: 'js/app.js', size: 100 },
    { name: 'manifest.json', size: Buffer.byteLength(JSON.stringify(MANIFEST)) },
  ]);
});

test('חבילה בלי manifest.json זורקת, ורשימת הרשומות עדיין עובדת', () => {
  const zip = buildZip([{ name: 'index.html', content: 'hi' }]);
  assert.throws(() => readManifestFromPlugin(zip), /manifest\.json not found/);
  assert.deepEqual(listPluginEntries(zip), [{ name: 'index.html', size: 2 }]);
});

test('קובץ שאינו ZIP זורק בשני הנתיבים', () => {
  const notZip = Buffer.from('לא ZIP בכלל, סתם טקסט ארוך למדי');
  assert.throws(() => readManifestFromPlugin(notZip), /Not a valid ZIP file/);
  assert.throws(() => listPluginEntries(notZip), /Not a valid ZIP file/);
});
