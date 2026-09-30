import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortcutLetter, isShortcut, isCtrl, isKey } from './keys.js';

// קיצורי-המקלדת בכל פריסה: עברית (e.key 'ז', e.code 'KeyZ'), עברית בלי e.code
// (מקלדת וירטואלית / שולחן-עבודה מרוחק), AZERTY (המקש של Z הוא KeyW) ורוסית.

const ev = (key, code, extra = {}) => ({ key, code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...extra });

test('האות של הקיצור: פריסה אנגלית ועברית — לפי המקש', () => {
  assert.equal(shortcutLetter(ev('z', 'KeyZ')), 'z');
  // עברית: Ctrl+Z נותן e.key 'ז' — המקש הפיזי קובע
  assert.equal(shortcutLetter(ev('ז', 'KeyZ')), 'z');
  assert.equal(shortcutLetter(ev('ט', 'KeyY')), 'y');
  assert.equal(shortcutLetter(ev('נ', 'KeyB')), 'b');
  assert.equal(shortcutLetter(ev('ן', 'KeyI')), 'i');
  assert.equal(shortcutLetter(ev('ל', 'KeyK')), 'k');
  // Shift (Ctrl+Shift+Z) — אות גדולה
  assert.equal(shortcutLetter(ev('Z', 'KeyZ', { shiftKey: true })), 'z');
  // רוסית ושאר הפריסות הלא-לטיניות
  assert.equal(shortcutLetter(ev('я', 'KeyZ')), 'z');
});

test('בלי e.code שימושי — האות העברית ← האות שעל אותו מקש בפריסה העברית', () => {
  for (const code of ['', 'Unidentified', undefined]) {
    assert.equal(shortcutLetter(ev('ז', code)), 'z', String(code));
    assert.equal(shortcutLetter(ev('ט', code)), 'y');
    assert.equal(shortcutLetter(ev('נ', code)), 'b');
    assert.equal(shortcutLetter(ev('ן', code)), 'i');
    assert.equal(shortcutLetter(ev('ל', code)), 'k');
  }
  // לא אות — null
  assert.equal(shortcutLetter(ev('1', 'Digit1')), null);
  assert.equal(shortcutLetter(ev('/', 'Slash')), null);
  assert.equal(shortcutLetter(ev('Enter', 'Enter')), null);
  assert.equal(shortcutLetter({}), null);
  assert.equal(shortcutLetter(null), null);
});

test('AZERTY / Dvorak: האות שעל המקש (e.key) קובעת — לא המקום הפיזי', () => {
  // ב-AZERTY המקש שכתוב עליו Z נמצא במקום של W (e.code 'KeyW')
  assert.equal(shortcutLetter(ev('z', 'KeyW')), 'z');
  // והמקש שבמקום הפיזי של Z הוא W — Ctrl+W, לא ביטול
  assert.equal(shortcutLetter(ev('w', 'KeyZ')), 'w');
  // Dvorak: Z על המקש של '/'
  assert.equal(shortcutLetter(ev('z', 'Slash')), 'z');
});

test('isShortcut: Ctrl או Cmd, בלי Alt (AltGr); Shift לפי הבקשה', () => {
  assert.equal(isShortcut(ev('ז', 'KeyZ'), 'z'), true);
  assert.equal(isShortcut(ev('ז', 'KeyZ', { ctrlKey: false, metaKey: true }), 'z'), true);
  assert.equal(isShortcut(ev('ז', 'KeyZ', { ctrlKey: false }), 'z'), false);
  assert.equal(isShortcut(ev('ז', 'KeyZ', { altKey: true }), 'z'), false, 'AltGr = Ctrl+Alt');
  assert.equal(isShortcut(ev('Z', 'KeyZ', { shiftKey: true }), 'z'), false, 'בלי Shift כברירת-מחדל');
  assert.equal(isShortcut(ev('Z', 'KeyZ', { shiftKey: true }), 'z', { shift: true }), true);
  assert.equal(isShortcut(ev('Z', 'KeyZ', { shiftKey: true }), 'z', { shift: null }), true);
  assert.equal(isShortcut(ev('z', 'KeyZ'), 'z', { shift: null }), true);
  assert.equal(isShortcut(ev('ט', ''), 'y'), true);
  assert.equal(isCtrl(ev('a', 'KeyA')), true);
  assert.equal(isCtrl(ev('a', 'KeyA', { altKey: true })), false);
});

test('מקשים שאינם אותיות: e.key, ואם אין — e.code', () => {
  assert.equal(isKey(ev('Enter', 'Enter'), 'Enter'), true);
  assert.equal(isKey(ev('Enter', 'NumpadEnter'), 'Enter'), true);
  assert.equal(isKey(ev('', 'NumpadEnter'), 'Enter'), true);
  assert.equal(isKey(ev(' ', 'Space'), 'Space'), true);
  assert.equal(isKey(ev('Unidentified', 'Space'), 'Space'), true);
  assert.equal(isKey(ev('F8', 'F8'), 'F8'), true);
  assert.equal(isKey(ev('Unidentified', 'F8'), 'F8'), true);
  assert.equal(isKey(ev('', 'ArrowDown'), 'ArrowDown'), true);
  assert.equal(isKey(ev('ArrowDown', 'Numpad2'), 'ArrowDown'), true);
  // מספר במקלדת המספרים (NumLock) אינו חץ; מקש שמופה מחדש — e.key קובע
  assert.equal(isKey(ev('2', 'Numpad2'), 'ArrowDown'), false);
  assert.equal(isKey(ev('Escape', 'CapsLock'), 'Escape'), true);
  assert.equal(isKey(ev('a', 'Escape'), 'Escape'), false);
  assert.equal(isKey(ev('ז', 'KeyZ'), 'Enter'), false);
});
