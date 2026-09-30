import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popupReducer, POPUP_CLOSED, initialPopupState, POPUP_OPEN_DELAY_MS, POPUP_CLOSE_DELAY_MS } from './popupState.js';

// מריץ רצף אירועים מהמצב הסגור
const run = (...events) => events.reduce((s, e) => popupReducer(s, e), POPUP_CLOSED);
const enter = (key) => ({ type: 'enterWord', key });

test('מצב-ההתחלה סגור, וקבועי-הזמן כמו באפיון', () => {
  assert.deepEqual(initialPopupState, { open: false, wordKey: null, hoverWord: false, hoverPopup: false, pendingClose: false });
  assert.equal(POPUP_OPEN_DELAY_MS, 250);
  assert.equal(POPUP_CLOSE_DELAY_MS, 180);
  // מצב חסר (undefined) = סגור
  assert.equal(popupReducer(undefined, { type: 'enterWord', key: '5:2' }).open, true);
});

test('ריחוף על מילה פותח; עזיבת המילה בלי כניסה לחלונית — נסגרת אחרי הטיימר', () => {
  let s = run(enter('5:2'));
  assert.equal(s.open, true);
  assert.equal(s.wordKey, '5:2');
  s = popupReducer(s, { type: 'leaveWord', key: '5:2' });
  assert.equal(s.open, true, 'עדיין פתוחה עד הטיימר');
  assert.equal(s.pendingClose, true);
  s = popupReducer(s, 'closeTimer');
  assert.deepEqual(s, POPUP_CLOSED);
});

test('מעבר מהמילה לחלונית — נשארת פתוחה; עזיבת החלונית — נסגרת', () => {
  let s = run(enter('5:2'), 'leaveWord', 'enterPopup');
  assert.equal(s.pendingClose, false);
  s = popupReducer(s, 'closeTimer'); // טיימר ישן שנורה באיחור
  assert.equal(s.open, true);
  assert.equal(s.hoverPopup, true);
  s = popupReducer(s, 'leavePopup');
  assert.equal(s.pendingClose, true);
  assert.deepEqual(popupReducer(s, 'closeTimer'), POPUP_CLOSED);
});

test('חזרה מהחלונית למילה מבטלת את הסגירה', () => {
  const s = run(enter('5:2'), 'leaveWord', 'enterPopup', 'leavePopup', enter('5:2'), 'closeTimer');
  assert.equal(s.open, true);
  assert.equal(s.hoverWord, true);
  assert.equal(s.pendingClose, false);
});

test('טיימר בלי סגירה ממתינה — לא סוגר', () => {
  const s = run(enter('5:2'), 'closeTimer');
  assert.equal(s.open, true);
});

test('blur (החלפת לשונית/חלון לא פעיל) סוגר מיד — גם כשהעכבר על החלונית', () => {
  assert.deepEqual(run(enter('5:2'), 'blur'), POPUP_CLOSED);
  assert.deepEqual(run(enter('5:2'), 'leaveWord', 'enterPopup', { type: 'blur' }), POPUP_CLOSED);
});

test('Escape, גלילה ובחירת הצעה סוגרים מיד', () => {
  for (const e of ['escape', 'scroll', 'pick']) assert.deepEqual(run(enter('1:0'), 'enterPopup', e), POPUP_CLOSED, e);
});

test('הזזת הסמן: נשארת במילה — פתוחה; עוזבת את המילה — נסגרת', () => {
  const s = run(enter('5:2'));
  assert.equal(popupReducer(s, { type: 'caretMove', key: '5:2' }).open, true);
  assert.deepEqual(popupReducer(s, { type: 'caretMove', key: '5:3' }), POPUP_CLOSED);
  assert.deepEqual(popupReducer(s, { type: 'caretMove' }), POPUP_CLOSED);
});

test('ריחוף על מילה אחרת מעביר את החלונית אליה; עזיבה של מילה זרה לא נוגעת', () => {
  let s = run(enter('5:2'), enter('7:0'));
  assert.equal(s.wordKey, '7:0');
  assert.equal(s.hoverPopup, false);
  s = popupReducer(s, { type: 'leaveWord', key: '5:2' });
  assert.equal(s.pendingClose, false);
  assert.equal(s.open, true);
});

test('פתיחה מהמקלדת: לא נסגרת מטיימר, כן מ-Escape ומהזזת הסמן', () => {
  let s = run({ type: 'openKeyboard', key: '3:1' });
  assert.equal(s.open, true);
  assert.equal(s.keyboard, true);
  assert.equal(s.hoverWord, false);
  s = popupReducer(s, 'closeTimer');
  assert.equal(s.open, true);
  assert.deepEqual(popupReducer(s, 'escape'), POPUP_CLOSED);
  assert.deepEqual(popupReducer(s, { type: 'caretMove', key: '3:2' }), POPUP_CLOSED);
  // אותה פתיחה דרך enterWord עם keyboard
  assert.equal(run({ type: 'enterWord', key: '3:1', keyboard: true }).hoverWord, false);
});

test('פתיחה מהמקלדת: תנועת-עכבר (עזיבת המילה או החלונית) אינה סוגרת, וריחוף אינו הופך אותה לחלונית-ריחוף', () => {
  let s = run({ type: 'openKeyboard', key: '3:1' });
  // העכבר עבר על המילה ויצא ממנה (למשל בדרך למילה הבאה)
  s = popupReducer(s, { type: 'leaveWord', key: '3:1' });
  assert.equal(s.pendingClose, false);
  assert.equal(popupReducer(s, 'closeTimer').open, true);
  s = popupReducer(s, enter('3:1'));
  assert.equal(s.keyboard, true, 'נשארת במצב מקלדת (↑↓ Enter)');
  assert.equal(s.hoverWord, true);
  s = popupReducer(s, { type: 'leaveWord', key: '3:1' });
  assert.equal(s.hoverWord, false);
  assert.equal(s.pendingClose, false);
  s = popupReducer(popupReducer(s, 'enterPopup'), 'leavePopup');
  assert.equal(s.pendingClose, false);
  assert.equal(popupReducer(s, 'closeTimer').open, true);
  // ריחוף על מילה אחרת — עוברת אליה כחלונית-ריחוף רגילה
  const other = popupReducer(s, enter('3:2'));
  assert.equal(other.wordKey, '3:2');
  assert.equal(other.keyboard, undefined);
  // ועדיין נסגרת מ-Escape
  assert.deepEqual(popupReducer(s, 'escape'), POPUP_CLOSED);
});

test('אירועים על חלונית סגורה — בלי שינוי; אירוע לא מוכר — בלי שינוי', () => {
  for (const e of ['leaveWord', 'enterPopup', 'leavePopup', 'closeTimer', 'caretMove', 'nope']) {
    assert.equal(popupReducer(POPUP_CLOSED, e), POPUP_CLOSED, e);
  }
  const s = run(enter('1:1'));
  assert.equal(popupReducer(s, { type: 'nope' }), s);
  assert.equal(popupReducer(s, { type: 'enterWord' }), s, 'enterWord בלי key');
});
