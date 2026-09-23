import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  companionFormFromPublic,
  checkCompanionFile,
  validateCompanionForm,
  appendCompanionFields
} from './pluginCompanionForm.js';
import { MAX_COMPANION_BYTES } from './pluginLimits.js';

test('companionFormFromPublic — ברירות מחדל לתוסף בלי תוכנה נלווית', () => {
  assert.deepEqual(companionFormFromPublic(null), {
    name: '',
    version: '',
    platform: 'windows',
    installsPlugin: false,
    serviceId: '',
    serviceMinVersion: '',
    hideUnlessInstalled: false
  });
});

test('companionFormFromPublic — ממלא מהייצוג הציבורי, כולל השירות', () => {
  const form = companionFormFromPublic({
    name: 'מתאם',
    version: '6.0',
    platform: 'linux',
    installsPlugin: true,
    service: { id: 'bridge', minVersion: '1.2', hideUnlessInstalled: true }
  });
  assert.equal(form.platform, 'linux');
  assert.equal(form.installsPlugin, true);
  assert.equal(form.serviceId, 'bridge');
  assert.equal(form.hideUnlessInstalled, true);
});

test('checkCompanionFile — סיומת שאינה של הפלטפורמה נדחית', () => {
  assert.match(checkCompanionFile({ fileName: 'setup.dmg', size: 10 }, 'windows'), /אינה מתאימה ל-Windows/);
  assert.match(checkCompanionFile({ fileName: 'setup', size: 10 }, 'windows'), /ללא סיומת/);
  assert.equal(checkCompanionFile({ fileName: 'Setup.MSI', size: 10 }, 'windows'), null);
});

test('checkCompanionFile — קובץ גדול מהמגבלה נדחה', () => {
  assert.match(checkCompanionFile({ fileName: 'a.exe', size: MAX_COMPANION_BYTES + 1 }, 'windows'), /חורג מהמגבלה/);
});

test('validateCompanionForm — שם בלי קובץ ובלי מתקין קיים אינו נזרק בשקט', () => {
  const form = { ...companionFormFromPublic(null), name: 'מתאם' };
  assert.match(validateCompanionForm(form, { hasFile: false, hasExisting: false }), /בלי קובץ מתקין/);
  assert.equal(validateCompanionForm(companionFormFromPublic(null), { hasFile: false, hasExisting: false }), null);
});

test('validateCompanionForm — קובץ או מתקין קיים מחייבים שם', () => {
  const empty = companionFormFromPublic(null);
  assert.match(validateCompanionForm(empty, { hasFile: true, hasExisting: false }), /שם התוכנה/);
  assert.match(validateCompanionForm(empty, { hasFile: false, hasExisting: true }), /שם התוכנה/);
});

test('validateCompanionForm — הסתרה מחייבת מזהה שירות', () => {
  const form = { ...companionFormFromPublic(null), name: 'מתאם', hideUnlessInstalled: true };
  assert.match(validateCompanionForm(form, { hasFile: true, hasExisting: false }), /מזהה שירות/);
  assert.equal(validateCompanionForm({ ...form, serviceId: 'bridge' }, { hasFile: true, hasExisting: false }), null);
});

test('appendCompanionFields — שולח את כל השדות, והקובץ רק כשיש', () => {
  const sent = [];
  const fd = { append: (k, v) => sent.push([k, v]) };
  const form = { ...companionFormFromPublic(null), name: ' מתאם ', serviceId: ' bridge ' };
  appendCompanionFields(fd, form, null);
  const keys = sent.map(([k]) => k);
  assert.ok(!keys.includes('companionFile'));
  assert.deepEqual(Object.fromEntries(sent), {
    companionName: 'מתאם',
    companionVersion: '',
    companionPlatform: 'windows',
    companionInstallsPlugin: 'false',
    companionServiceId: 'bridge',
    companionServiceMinVersion: '',
    companionHideUnlessInstalled: 'false'
  });

  const withFile = [];
  appendCompanionFields({ append: (k, v) => withFile.push([k, v]) }, form, 'FILE');
  assert.deepEqual(withFile[0], ['companionFile', 'FILE']);
});
