/**
 * זכאות למערכת התיקונים = המייל מגיע לתיבת אוצריא (CONTRACT §1.4). הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachesOtzariaInbox, NON_OTZARIA_SOURCE_FOLDER_RE } from './report-email.js';

const CASES = [
  // כל מפתח ב-SOURCE_EMAIL_MAPPING
  ['sefariaToOtzaria', false],
  ['sefaria', false],
  ['wiki_jewish_books', true],
  ['wikiSource', true],
  ['Pninim', true],
  ['Tashma', true],
  ['Ben-Yehuda', true],
  // רישיות ותת-מחרוזת — כמו ניתוב המייל
  ['SefariaToOtzaria', false],
  ['SEFARIA', false],
  ['my-sefaria-x', false],
  ['WIKISOURCE', true],
  ['ToratEmetToOtzaria', true],
  ['DictaToOtzaria', true],
  ['(לא נשלחה תיקיית מקור)', true],
  ['', true],
  [null, true],
  [undefined, true],
];

test('reachesOtzariaInbox: טבלת מקורות', () => {
  for (const [folder, expected] of CASES) assert.equal(reachesOtzariaInbox(folder), expected, String(folder));
});

test('מסנן ה-Mongo לדיווחים ישנים תואם את reachesOtzariaInbox', () => {
  for (const [folder] of CASES) {
    if (typeof folder !== 'string' || !folder) continue;
    assert.equal(!NON_OTZARIA_SOURCE_FOLDER_RE.test(folder), reachesOtzariaInbox(folder), folder);
  }
});
