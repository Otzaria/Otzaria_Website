// מצב-העבודה על שורה אחת בנתב (טהור): כתב השורה, פסול, והכתב של כל מילה בשורה מעורבת.
// מה שנשמר באתר = toMarkBody(draft) — רק כשהטיוטה שלמה (בשורה מעורבת: לכל מילה יש כתב).
//
// draft = {label: null|'square'|'rashi'|'latin'|'mixed', bad: bool,
//          words: [{k, box, pred, label}] | null, wordsSrc: 'station'|'site'|null}
// המילים: מהתחנה (item.words), או מהחלוקה לפי הדיו (inkBoxes) כשאין.

import { ROUTER_KEYS, ROUTER_WORD_KEYS } from '@/lib/trainingProof/vocab';

export function stationWords(item) {
  return Array.isArray(item.words) && item.words.length
    ? item.words.map((w) => ({ k: w.k, box: w.box, pred: w.pred || null, label: null }))
    : null;
}

// הטיוטה ההתחלתית: מה שכבר נשמר (result), אחרת ריקה
export function initDraft(item) {
  const r = item.result;
  const words = stationWords(item);
  if (r) {
    if (r.bad) return { label: null, bad: true, words, wordsSrc: words ? 'station' : null };
    if (r.label === 'mixed') {
      const preds = new Map((words || []).map((w) => [w.k, w.pred]));
      return {
        label: 'mixed',
        bad: false,
        words: (r.words || []).map((w) => ({ k: w.k, box: w.box, pred: preds.get(w.k) || null, label: w.label })),
        wordsSrc: r.words_src || 'site',
      };
    }
    return { label: r.label, bad: false, words, wordsSrc: words ? 'station' : null };
  }
  return { label: null, bad: false, words, wordsSrc: words ? 'station' : null };
}

// המילים מהדיו, לשורה בלי מילים מהתחנה (נקרא כשהתמונה נטענה)
export function withInkWords(draft, inkBoxes) {
  if (draft.words?.length || !inkBoxes?.length) return draft;
  return { ...draft, words: inkBoxes.map((box, k) => ({ k, box, pred: null, label: null })), wordsSrc: 'site' };
}

export const isMixed = (draft, item) => (draft.label || (!draft.bad && item.pred)) === 'mixed' && !draft.bad;

export const missingWords = (draft) => (draft.words || []).filter((w) => !w.label).length;

// שלמה = אפשר לשמור
export function isComplete(draft) {
  if (draft.bad) return true;
  if (!draft.label) return false;
  if (draft.label !== 'mixed') return true;
  return !!draft.words?.length && missingWords(draft) === 0;
}

export function toMarkBody(draft) {
  if (draft.bad) return { bad: true };
  if (draft.label !== 'mixed') return { label: draft.label };
  return { label: 'mixed', words: draft.words.map((w) => ({ k: w.k, box: w.box, label: w.label })) };
}

export function setLine(draft, label) {
  return { ...draft, label, bad: false };
}

export const setBad = (draft) => ({ ...draft, bad: true, label: null });

export function setWord(draft, index, label) {
  if (!draft.words?.[index]) return draft;
  const words = draft.words.map((w, i) => (i === index ? { ...w, label } : w));
  return { ...draft, label: 'mixed', bad: false, words };
}

// "ההצעה נכונה" (Enter): כתב-השורה של הנתב; במעורבת — ההצעה לכל מילה שעוד לא סומנה
export function acceptSuggestion(draft, item) {
  const label = draft.label || item.pred;
  if (!label) return draft;
  if (label !== 'mixed') return { ...draft, label, bad: false };
  const words = (draft.words || []).map((w) => (w.label ? w : { ...w, label: w.pred }));
  return { ...draft, label: 'mixed', bad: false, words };
}

// מקש 1–4 / 0 → פעולה. focus: 'line' | 'words'
export function keyAction(key, focus) {
  if (key === '0') return { type: 'bad' };
  if (focus === 'words' && ROUTER_WORD_KEYS[key]) return { type: 'word', label: ROUTER_WORD_KEYS[key] };
  if (ROUTER_KEYS[key]) return { type: 'line', label: ROUTER_KEYS[key] };
  return null;
}

// המילה הבאה שעוד לא סומנה (מהמילה הנוכחית והלאה, ואז מההתחלה), או הנוכחית
export function nextOpenWord(draft, from) {
  const ws = draft.words || [];
  for (let i = 1; i <= ws.length; i++) {
    const j = (from + i) % ws.length;
    if (!ws[j].label) return j;
  }
  return Math.min(from + 1, Math.max(0, ws.length - 1));
}
