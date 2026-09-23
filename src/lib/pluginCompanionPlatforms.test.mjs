import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANION_PLATFORMS,
  COMPANION_PLATFORM_KEYS,
  companionPlatformLabel,
  companionPlatformExtensions,
  companionExtOf,
  detectViewerPlatform
} from './pluginCompanionPlatforms.js';

test('COMPANION_PLATFORM_KEYS תואם למפתחות COMPANION_PLATFORMS', () => {
  assert.deepEqual(COMPANION_PLATFORM_KEYS, Object.keys(COMPANION_PLATFORMS));
});

test('companionPlatformLabel / Extensions — פלטפורמה לא מוכרת מחזירה ריק', () => {
  assert.equal(companionPlatformLabel('macos'), 'macOS');
  assert.equal(companionPlatformLabel('beos'), '');
  assert.deepEqual(companionPlatformExtensions('windows'), ['.exe', '.msi']);
  assert.deepEqual(companionPlatformExtensions(null), []);
});

test('companionExtOf — סיומת אחרונה, באותיות קטנות, בלי תיקיות', () => {
  assert.equal(companionExtOf('Setup.EXE'), '.exe');
  assert.equal(companionExtOf('app.tar.AppImage'), '.appimage');
  assert.equal(companionExtOf('C:\\dir.v2\\setup'), '');
  assert.equal(companionExtOf('dir.v2/setup.msi'), '.msi');
  assert.equal(companionExtOf('.bashrc'), '');
  assert.equal(companionExtOf(''), '');
  assert.equal(companionExtOf(undefined), '');
});

test('detectViewerPlatform — טלפונים לפני Linux/Mac', () => {
  assert.equal(detectViewerPlatform('Mozilla/5.0 (Linux; Android 14)'), 'other');
  assert.equal(detectViewerPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17 like Mac OS X)'), 'other');
  assert.equal(detectViewerPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows');
  assert.equal(detectViewerPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'macos');
  assert.equal(detectViewerPlatform('Mozilla/5.0 (X11; Linux x86_64)'), 'linux');
  assert.equal(detectViewerPlatform(''), 'other');
});
