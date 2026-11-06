import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SENDER_EMAIL,
  FIELD_CAPS,
  REPORTING_ERRORS_RECIPIENT,
  SEFARIA_ERRORS_RECIPIENT,
  buildCorrectionSnippets,
  buildEmailBodies,
  buildHtml,
  buildSefariaLink,
  buildText,
  capField,
  computeContentHash,
  ensureSmtpConfig,
  escapeHtml,
  extractLibraryVersion,
  getDedupCutoff,
  getEmailRecipients,
  normalizePayload,
  normalizeRecipient,
  toSafeIsoDate,
  toSafeLineNumber,
  toSafeString,
} from './errorReportLogic';

describe('toSafeString', () => {
  it('trims and returns the value when present', () => {
    expect(toSafeString('  hello  ')).toBe('hello');
  });

  it('falls back when value is empty/whitespace/null/undefined', () => {
    expect(toSafeString('', 'fallback')).toBe('fallback');
    expect(toSafeString('   ', 'fallback')).toBe('fallback');
    expect(toSafeString(null, 'fallback')).toBe('fallback');
    expect(toSafeString(undefined, 'fallback')).toBe('fallback');
  });

  it('defaults fallback to empty string', () => {
    expect(toSafeString(undefined)).toBe('');
  });
});

describe('capField', () => {
  it('truncates to the max length', () => {
    expect(capField('abcdef', 3, 'x')).toBe('abc');
  });

  it('uses the fallback when empty, then still caps it', () => {
    expect(capField('', 2, 'fallback')).toBe('fa');
  });
});

describe('toSafeLineNumber', () => {
  it('returns positive integers unchanged', () => {
    expect(toSafeLineNumber(42)).toBe(42);
  });

  it('parses numeric strings', () => {
    expect(toSafeLineNumber('17')).toBe(17);
  });

  it('falls back to 1 for zero, negative, non-numeric, or missing values', () => {
    expect(toSafeLineNumber(0)).toBe(1);
    expect(toSafeLineNumber(-5)).toBe(1);
    expect(toSafeLineNumber('abc')).toBe(1);
    expect(toSafeLineNumber(undefined)).toBe(1);
    expect(toSafeLineNumber(null)).toBe(1);
  });

  it('truncates a non-integer number via string parsing (documented current behavior)', () => {
    // Number.isInteger(3.5) is false, so it falls through to parseInt(String(3.5)) === 3
    expect(toSafeLineNumber(3.5)).toBe(3);
  });
});

describe('toSafeIsoDate', () => {
  it('converts a valid date-like value to ISO', () => {
    expect(toSafeIsoDate('2024-01-01T00:00:00.000Z')).toBe('2024-01-01T00:00:00.000Z');
  });

  it('falls back to now for invalid dates', () => {
    const result = toSafeIsoDate('not-a-date');
    expect(() => new Date(result).toISOString()).not.toThrow();
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
  });
});

describe('extractLibraryVersion', () => {
  it('prefers the explicit library_version field', () => {
    expect(extractLibraryVersion({ library_version: '1.2.3', error_details: 'גרסת ספריה: 9.9.9' })).toBe('1.2.3');
  });

  it('falls back to parsing error_details when explicit version missing', () => {
    expect(extractLibraryVersion({ error_details: 'גרסת ספרייה: 2.0.1' })).toBe('2.0.1');
  });

  it('supports the geresh variant of the Hebrew word', () => {
    expect(extractLibraryVersion({ error_details: "גרסת ספרי'ה: 3.1.0" })).toBe('3.1.0');
  });

  it('returns unknown when nothing matches', () => {
    expect(extractLibraryVersion({ error_details: 'no version here' })).toBe('unknown');
    expect(extractLibraryVersion({})).toBe('unknown');
    expect(extractLibraryVersion(null)).toBe('unknown');
  });

  it('caps error_details length before matching (ReDoS guard)', () => {
    const huge = 'x'.repeat(10_000) + 'גרסת ספרייה: 5.5.5';
    // the version marker is beyond the 5000-char cap, so it should not be found
    expect(extractLibraryVersion({ error_details: huge })).toBe('unknown');
  });
});

describe('normalizePayload', () => {
  it('normalizes a full valid payload', () => {
    const result = normalizePayload({
      sender_email: 'user@example.com',
      report_id: 'abc123',
      subject: 'subj',
      book_title: 'Book',
      current_ref: 'Ref 1',
      line_number: 5,
      selected_text: 'text',
      error_details: 'details',
      context_text: 'context',
      file_path: '/a/b',
      source_folder: 'folder',
      created_at: '2024-01-01T00:00:00.000Z',
    });
    expect(result.sender_email).toBe('user@example.com');
    expect(result.report_id).toBe('abc123');
    expect(result.line_number).toBe(5);
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('uses DEFAULT_SENDER_EMAIL for an invalid sender email', () => {
    const result = normalizePayload({ sender_email: 'not-an-email' });
    expect(result.sender_email).toBe(DEFAULT_SENDER_EMAIL);
  });

  it('generates a fallback report_id when missing', () => {
    const result = normalizePayload({});
    expect(result.report_id).toMatch(/^missing-/);
  });

  it('applies fallbacks for missing text fields', () => {
    const result = normalizePayload({});
    expect(result.subject).toBe('דיווח טעות ללא נושא');
    expect(result.book_title).toBe('לא צוין ספר');
    expect(result.current_ref).toBe('לא צוין מיקום');
    expect(result.selected_text).toBe('(לא נשלח טקסט מסומן)');
    expect(result.error_details).toBe('(לא נשלח פירוט טעות)');
    expect(result.context_text).toBe('(לא נשלח טקסט הקשר)');
    expect(result.file_path).toBe('(לא נשלח נתיב קובץ)');
    expect(result.source_folder).toBe('(לא נשלחה תיקיית מקור)');
    expect(result.line_number).toBe(1);
  });

  it('caps oversized fields at FIELD_CAPS limits', () => {
    const result = normalizePayload({ subject: 'a'.repeat(1000) });
    expect(result.subject.length).toBe(FIELD_CAPS.subject);
  });

  it('handles non-object payloads (null, array, string) as empty', () => {
    expect(normalizePayload(null).subject).toBe('דיווח טעות ללא נושא');
    expect(normalizePayload([1, 2, 3]).subject).toBe('דיווח טעות ללא נושא');
    expect(normalizePayload('oops').subject).toBe('דיווח טעות ללא נושא');
  });

  it('truncates an overly long report_id to 128 chars', () => {
    const result = normalizePayload({ report_id: 'x'.repeat(500) });
    expect(result.report_id.length).toBe(128);
  });
});

describe('ensureSmtpConfig', () => {
  it('reports all missing required env vars', () => {
    const original = { ...process.env };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    try {
      const missing = ensureSmtpConfig();
      expect(missing).toEqual(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']);
    } finally {
      process.env = original;
    }
  });

  it('returns an empty array when all required env vars are set', () => {
    const original = { ...process.env };
    process.env.SMTP_HOST = 'h';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    process.env.SMTP_FROM = 'f';
    try {
      expect(ensureSmtpConfig()).toEqual([]);
    } finally {
      process.env = original;
    }
  });
});

describe('escapeHtml', () => {
  it('escapes the standard HTML-sensitive characters', () => {
    expect(escapeHtml(`<a href="x">O'Brien & Co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#039;Brien &amp; Co&lt;/a&gt;'
    );
  });

  it('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('normalizeRecipient', () => {
  it('lowercases and trims', () => {
    expect(normalizeRecipient('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('handles null/undefined', () => {
    expect(normalizeRecipient(null)).toBe('');
    expect(normalizeRecipient(undefined)).toBe('');
  });
});

describe('computeContentHash', () => {
  it('is deterministic for the same content fields', () => {
    const payload = {
      book_title: 'A', current_ref: 'B', line_number: 1,
      selected_text: 'C', error_details: 'D', context_text: 'E', source_folder: 'F',
    };
    expect(computeContentHash(payload)).toBe(computeContentHash({ ...payload }));
  });

  it('changes when any content field changes', () => {
    const base = {
      book_title: 'A', current_ref: 'B', line_number: 1,
      selected_text: 'C', error_details: 'D', context_text: 'E', source_folder: 'F',
    };
    const changed = { ...base, error_details: 'DIFFERENT' };
    expect(computeContentHash(base)).not.toBe(computeContentHash(changed));
  });

  it('ignores metadata fields not part of the content set (report_id, sender_email)', () => {
    const base = {
      book_title: 'A', current_ref: 'B', line_number: 1,
      selected_text: 'C', error_details: 'D', context_text: 'E', source_folder: 'F',
      report_id: 'id-1', sender_email: 'a@a.com',
    };
    const differentMeta = { ...base, report_id: 'id-2', sender_email: 'b@b.com' };
    expect(computeContentHash(base)).toBe(computeContentHash(differentMeta));
  });
});

describe('computeContentHash compatibility and structured corrections', () => {
  const legacy = {
    book_title: 'A', current_ref: 'B', line_number: 1,
    selected_text: 'C', error_details: 'D', context_text: 'E', source_folder: 'F',
  };
  const correction = {
    originalLine: 'לפני שגוי אחרי', originalSelection: 'שגוי',
    selectionOffset: { unit: 'utf16_code_units', start: 5, end: 9 },
    proposedText: 'מתוקן', contextBefore: 'לפני ', contextAfter: ' אחרי',
  };
  const structured = { ...legacy, correction, he_ref: 'בראשית א:א' };

  it.each([
    [legacy, '3b78da21e6ebaa4a23db58a58f1a927c5a5938c4cbd0e574a4f0b160cf5fa460'],
    [{
      book_title: '  ספר ', current_ref: '\nסימן א\t', line_number: 0,
      selected_text: ' טקסט ', error_details: 'פירוט', context_text: 'הקשר', source_folder: 'sefaria',
    }, 'bfd44bcb73980bcf57ba221941d62076a5eaf29d77af329abc076910e0c614f5'],
    [{}, '7d28d4f40bc444020b37bc9540a3654da81ef5b5f6952ab7df6748d5d894f2ed'],
  ])('retains exact legacy hash bytes for %j', (payload, hash) => {
    expect(computeContentHash(payload)).toBe(hash);
    expect(computeContentHash({ ...payload, correction: null, he_ref: 'another ref' })).toBe(hash);
  });

  it('separates structured corrections from the legacy hash domain', () => {
    expect(computeContentHash(structured)).not.toBe(computeContentHash(legacy));
  });

  it.each([
    ['originalLine', 'לפני שגוי אחר'],
    ['originalSelection', 'שגוי אחר'],
    ['selectionOffset', { unit: 'utf16_code_units', start: 6, end: 10 }],
    ['proposedText', 'הצעה אחרת'],
    ['proposedText', null],
    ['proposedText', ''],
    ['contextBefore', 'פתיחה אחרת '],
    ['contextAfter', ' סיום אחר'],
  ])('includes the full canonical %s field (%j)', (field, value) => {
    expect(computeContentHash({ ...structured, correction: { ...correction, [field]: value } }))
      .not.toBe(computeContentHash(structured));
  });

  it.each(['originalLine', 'proposedText', 'contextBefore', 'contextAfter'])('includes late changes in %s beyond the display cap', (field) => {
    const prefix = 'א'.repeat(12_502);
    const a = { ...structured, correction: { ...correction, [field]: prefix + 'ב' } };
    const b = { ...structured, correction: { ...correction, [field]: prefix + 'ג' } };
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it.each(['בראשית א:ב', null])('includes the validated he_ref (%j)', (he_ref) => {
    expect(computeContentHash({ ...structured, he_ref })).not.toBe(computeContentHash(structured));
  });

  it('still includes the legacy content fields for structured corrections', () => {
    expect(computeContentHash({ ...structured, error_details: 'different reporter note' }))
      .not.toBe(computeContentHash(structured));
  });

  it('ignores reporter, report ID, timestamps and client digest', () => {
    expect(computeContentHash({
      ...structured, report_id: 'other-id', sender_email: 'another@example.com',
      created_at: '2026-11-05T00:00:00.000Z', content_digest: 'f'.repeat(64),
    })).toBe(computeContentHash(structured));
  });

  it('is independent of canonical correction property order', () => {
    const reordered = Object.fromEntries(Object.entries(correction).reverse());
    reordered.selectionOffset = { end: 9, start: 5, unit: 'utf16_code_units' };
    expect(computeContentHash({ ...structured, correction: reordered })).toBe(computeContentHash(structured));
  });

  it('preserves accepted lone surrogate code units in he_ref', () => {
    const hash = computeContentHash({ ...structured, he_ref: '\ud800' });
    expect(hash).not.toBe(computeContentHash({ ...structured, he_ref: '\ud801' }));
    expect(hash).not.toBe(computeContentHash({ ...structured, he_ref: '\ufffd' }));
  });

  it('preserves an accepted empty selection inside a surrogate pair', () => {
    const line = 'א😀ב';
    const split = { ...structured, correction: {
      originalLine: line, originalSelection: '',
      selectionOffset: { unit: 'utf16_code_units', start: 2, end: 2 },
      proposedText: 'תיקון', contextBefore: line.slice(0, 2), contextAfter: line.slice(2),
    } };
    const hash = computeContentHash(split);
    for (const field of ['contextBefore', 'contextAfter']) {
      expect(hash).not.toBe(computeContentHash({ ...split, correction: {
        ...split.correction, [field]: split.correction[field].toWellFormed(),
      } }));
    }
  });
});

describe('getDedupCutoff', () => {
  it('subtracts DEDUP_WINDOW_MONTHS from the reference date', () => {
    const reference = new Date('2024-07-15T00:00:00.000Z');
    const cutoff = getDedupCutoff(reference);
    expect(cutoff.getUTCFullYear()).toBe(2024);
    expect(cutoff.getUTCMonth()).toBe(0); // January (6 months back from July)
  });
});

describe('getEmailRecipients', () => {
  it('defaults to the Otzaria recipient with no cc when source is empty', () => {
    expect(getEmailRecipients('')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: null,
      isSefariaOnly: false,
    });
    expect(getEmailRecipients(null)).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: null,
      isSefariaOnly: false,
    });
  });

  it('routes Sefaria sources to Sefaria with a cc to Tashma', () => {
    expect(getEmailRecipients('SefariaToOtzaria')).toEqual({
      primary: SEFARIA_ERRORS_RECIPIENT,
      cc: 'jewishoffice@gmail.com',
      isSefariaOnly: true,
    });
  });

  it('routes other known sources to Otzaria with a cc to the source', () => {
    expect(getEmailRecipients('wikiJewishBooksToOtzaria')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: 'WikiJewishBooks@gmail.com',
      isSefariaOnly: false,
    });
  });

  it('routes Dicta books to Otzaria with a cc to Tashma', () => {
    expect(getEmailRecipients('DictaToOtzaria')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: 'jewishoffice@gmail.com',
      isSefariaOnly: false,
    });
  });

  it('routes yam-HaHachma books to Otzaria with a cc to the source repository', () => {
    expect(getEmailRecipients('yam-HaHachmaToOtzaria')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: 'y025837086@gmail.com',
      isSefariaOnly: false,
    });
  });

  it('falls back to Otzaria-only for unknown sources', () => {
    expect(getEmailRecipients('some_unknown_source')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: null,
      isSefariaOnly: false,
    });
  });

  it('matches source keys case-insensitively', () => {
    expect(getEmailRecipients('PNINIM')).toEqual({
      primary: REPORTING_ERRORS_RECIPIENT,
      cc: 'contact@pninim.org',
      isSefariaOnly: false,
    });
  });
});

describe('buildSefariaLink', () => {
  it('returns empty string when either argument missing', () => {
    expect(buildSefariaLink('', 'ref')).toBe('');
    expect(buildSefariaLink('book', '')).toBe('');
  });

  it('builds a URL and strips a duplicated leading book title from the ref', () => {
    expect(buildSefariaLink('Genesis', 'Genesis, 1:1')).toBe(
      `https://www.sefaria.org/${encodeURIComponent('Genesis, 1:1')}`
    );
  });

  it('keeps the ref as-is when it does not start with the book title', () => {
    expect(buildSefariaLink('Genesis', '1:1')).toBe(`https://www.sefaria.org/${encodeURIComponent('Genesis, 1:1')}`);
  });

  it('drops TOC labels that Sefaria does not parse', () => {
    expect(decodeURIComponent(buildSefariaLink('בית יוסף', 'בית יוסף, אורח חיים, סימן שיח, סעיף קטן טו'))).toBe(
      'https://www.sefaria.org/בית יוסף, אורח חיים, שיח, טו'
    );
  });

  it('prefers the exact Sefaria ref (he_ref) and collapses its spacing', () => {
    expect(decodeURIComponent(buildSefariaLink('בית יוסף', 'בית יוסף, אורח חיים, סימן שיח', 'בית יוסף, אורח חיים,  שיח, טו, א'))).toBe(
      'https://www.sefaria.org/בית יוסף, אורח חיים, שיח, טו, א'
    );
  });
});

describe('buildCorrectionSnippets', () => {
  const line = '<b>ומ"ש</b> בכרמלית הסמוך לו וכתב כרא"ש הרמב"ם בפי"ז השוה יחד ועוד שתי מילים';
  const selection = 'כרא"ש';
  const start = line.indexOf(selection);
  const correction = (proposedText) => ({
    originalLine: line,
    originalSelection: selection,
    contextBefore: line.slice(0, start),
    contextAfter: line.slice(start + selection.length),
    proposedText,
  });

  it('returns four words around the change, before and after, with the change marked', () => {
    expect(buildCorrectionSnippets(correction('הרא"ש'))).toEqual({
      wrong: 'בכרמלית הסמוך לו וכתב כרא"ש הרמב"ם בפי"ז השוה יחד',
      fixed: 'בכרמלית הסמוך לו וכתב *הרא"ש* הרמב"ם בפי"ז השוה יחד',
    });
  });

  it('marks a deletion with the deleted words', () => {
    expect(buildCorrectionSnippets(correction('')).fixed).toBe('בכרמלית הסמוך לו וכתב *(נמחק: כרא"ש)* הרמב"ם בפי"ז השוה יחד');
  });

  it('shows the text as displayed: <br> separates words and entities are decoded', () => {
    const wholeLine = (originalLine, proposedText) => ({ originalLine, originalSelection: null, proposedText });
    expect(buildCorrectionSnippets(wholeLine('מילה<br>אחרת שגוי', 'מילה<br/>אחרת נכון'))).toEqual({
      wrong: 'מילה אחרת שגוי',
      fixed: 'מילה אחרת *נכון*',
    });
    expect(buildCorrectionSnippets(wholeLine('אמר &quot;שלום&#x5D0; a<b c', 'אמר &quot;שלום&#x5D0; a<b d')).wrong).toBe('אמר "שלוםא a<b c');
  });

  it('returns null without a proposal or without a visible change', () => {
    expect(buildCorrectionSnippets(null)).toBeNull();
    expect(buildCorrectionSnippets(correction(null))).toBeNull();
    expect(buildCorrectionSnippets({ originalLine: 'א <b>ב</b>', originalSelection: null, proposedText: 'א ב' })).toBeNull();
  });

  it.each([false, true])('distinguishes repeated excerpts in both mail formats (whole line: %s)', (wholeLine) => {
    const originalLine = 'פתיחה ' + 'לפני אחד שני שלוש טעות אחרי אחת שתיים שלוש '.repeat(3) + 'סיום';
    const starts = [...originalLine.matchAll(/טעות/g)].map((match) => match.index);
    const bodies = starts.map((start, index) => {
      const corrected = originalLine.slice(0, start) + 'תיקון' + originalLine.slice(start + 4);
      const c = wholeLine ? { originalLine, originalSelection: null, proposedText: corrected } : {
        originalLine, originalSelection: 'טעות', proposedText: 'תיקון',
        selectionOffset: { unit: 'utf16_code_units', start, end: start + 4 },
        contextBefore: originalLine.slice(0, start), contextAfter: originalLine.slice(start + 4),
      };
      const snapshot = structuredClone(c);
      const snippets = buildCorrectionSnippets(c);
      expect(snippets.wrong).toBe('לפני אחד שני שלוש טעות אחרי אחת שתיים שלוש');
      expect(snippets.context).toEqual({
        wordStart: index * 9 + 2, wordEnd: index * 9 + 10, wordCount: 29,
        original: originalLine, corrected,
      });
      const mail = buildEmailBodies({ book_title: 'ספר בדיקה', source_folder: 'pninim', correction: c });
      expect(mail.text).toContain(`מילים ${index * 9 + 2}–${index * 9 + 10} מתוך 29`);
      expect(mail.text).toContain(`השורה המקורית המלאה:\n${originalLine}`);
      expect(mail.text).toContain(`השורה המתוקנת המלאה:\n${corrected}`);
      expect(mail.html).toContain(corrected);
      expect(c).toEqual(snapshot);
      return mail;
    });
    expect(new Set(bodies.map((body) => body.text)).size).toBe(3);
    expect(new Set(bodies.map((body) => body.html)).size).toBe(3);
  });

  it('escapes full repeated context, including decoded entities, while preserving exact input', () => {
    const part = '&lt;img src=x onerror=alert(1)&gt; אחד שני שלוש שגוי אחרי אחת שתיים שלוש ';
    const originalLine = part.repeat(3).trim();
    const start = originalLine.indexOf('שגוי', originalLine.indexOf('שגוי') + 1);
    const correction = {
      originalLine, originalSelection: 'שגוי', proposedText: 'נכון',
      contextBefore: originalLine.slice(0, start), contextAfter: originalLine.slice(start + 4),
    };
    const mail = buildEmailBodies({ source_folder: 'pninim', correction });
    expect(mail.html).toContain('השורה המקורית המלאה');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).not.toContain('<img');
    expect(correction.originalLine).toBe(originalLine);
  });

  it.each([
    ['א <B title="x">ב</B> ג', 'א ב ג'],
    ['א <span title="a < b">ב</span> ג', 'א ב ג'],
    ['א <span title="a > b">ב</span> ג', 'א ב ג'],
    ["א <span title='a > b'><b>ב</b></span> ג", 'א ב ג'],
    ['א<!-- תגובה <b>טקסט</b> > --> <i>ב</i> ג', 'א ב ג'],
    ['א ב ג<!-- הערה פתוחה', 'א ב ג'],
    ['<b title="a > b">שָׁלוֹם&nbsp;<i>&quot;אָב&#x5D0;</i></b><br>סוף', 'שָׁלוֹם "אָבא סוף'],
    ['א <a<b>ב</b> ג', 'א ב ג'],
    ['א <1> ב < ג', 'א <1> ב < ג'],
    ['א <b>ב</b> <c <d סוף', 'א ב <c <d סוף'],
    ['א<BR />ב<Br/>ג<BR>ד', 'א ב ג ד'],
    ['א &lt;b&gt;ב&lt;/b&gt; ג', 'א <b>ב</b> ג'],
  ])('preserves display-tag behavior for %s', (originalLine, displayed) => {
    expect(buildCorrectionSnippets({ originalLine, originalSelection: null, proposedText: 'תוקן' })).toEqual({
      wrong: displayed,
      fixed: '*תוקן*',
    });
  });

  it('does not expose quoted attributes around an actual proposed correction', () => {
    const correction = {
      originalLine: '<span title="a > b">שגוי</span> אחד שתיים',
      originalSelection: null,
      proposedText: '<span title="a > b">נכון</span> אחד שתיים',
    };
    expect(buildCorrectionSnippets(correction)).toEqual({ wrong: 'שגוי אחד שתיים', fixed: '*נכון* אחד שתיים' });
    expect(correction.originalLine).toContain('title="a > b"');
    expect(correction.proposedText).toContain('title="a > b"');
  });
});

describe('buildHtml / buildText', () => {
  const payload = {
    book_title: 'Book <b>',
    current_ref: 'Ref & 1',
    line_number: 3,
    selected_text: 'sel',
    error_details: 'err',
    context_text: 'ctx',
    file_path: '/f',
    source_folder: 'wikiSource',
    sender_email: 'a@a.com',
    created_at: '2024-01-01T00:00:00.000Z',
    report_id: 'rid-1',
    library_version: '1.0.0',
  };

  it('escapes untrusted fields in the HTML output', () => {
    const html = buildHtml(payload, []);
    expect(html).toContain('Book &lt;b&gt;');
    expect(html).not.toContain('Book <b>');
  });

  it('includes a cc notice only when cc recipients are given', () => {
    const withCc = buildHtml(payload, ['x@x.com']);
    const withoutCc = buildHtml(payload, []);
    expect(withCc).toContain('עותק מדיווח זה נשלח גם ל');
    expect(withoutCc).not.toContain('עותק מדיווח זה נשלח גם ל');
  });

  it('includes a direct Sefaria link only for wiki/sefaria-only sources', () => {
    // wikiSource is not "sefaria"-only (getEmailRecipients isSefariaOnly is only for sources containing "sefaria")
    const html = buildHtml(payload, []);
    expect(html).not.toContain('קישור ישיר');
    const sefariaPayload = { ...payload, source_folder: 'sefariaToOtzaria' };
    const sefariaHtml = buildHtml(sefariaPayload, []);
    expect(sefariaHtml).toContain('קישור ישיר');
  });

  it('escapes the correction snippets in the HTML output', () => {
    const html = buildHtml({
      ...payload,
      source_folder: 'sefariaToOtzaria',
      correction: { originalLine: 'א ב', originalSelection: null, proposedText: 'א <script>x</script>&lt;i&gt;' },
    }, []);
    expect(html).toContain('הטקסט המתוקן');
    expect(html).toContain('*x&lt;i&gt;*');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>');
  });

  it('shows wrong and corrected text instead of the raw fields for a correction', () => {
    const text = buildText({
      ...payload,
      source_folder: 'sefariaToOtzaria',
      error_details: 'הערה\n\n--- הצעת תיקון ---\nמקור: ב\nמוצע: ג',
      correction: { originalLine: 'א ב', originalSelection: 'ב', contextBefore: 'א ', contextAfter: '', proposedText: 'ג' },
    }, []);
    expect(text).toContain('הטקסט השגוי:\nא ב\n\nהטקסט המתוקן:\nא *ג*\n\nהערת המדווח:\nהערה\n');
    expect(text).not.toContain('הטקסט המסומן');
    expect(text).not.toContain('--- הצעת תיקון ---');
    const otherSource = buildText({ ...payload, correction: { originalLine: 'א ב', originalSelection: null, proposedText: 'א ג' } }, []);
    expect(otherSource).toContain('הטקסט המתוקן:\nא *ג*\n');
    expect(otherSource).not.toContain('קישור ישיר');
  });

  it('buildText produces plain-text with the same conditional sections', () => {
    const text = buildText(payload, ['cc@x.com']);
    expect(text).toContain('** עותק מדיווח זה נשלח גם ל: cc@x.com **');
    expect(text).toContain('ספר: Book <b>'); // plain text is not escaped
  });

  it.each(['א ג', 'א <b>ב</b>'])('prepares snippets once for both bodies, including an invisible change: %s', (proposedText) => {
    let originalReads = 0;
    const report = {
      ...payload,
      source_folder: 'sefariaToOtzaria',
      correction: {
        get originalLine() { originalReads++; return 'א ב'; },
        originalSelection: null,
        proposedText,
      },
    };
    const bodies = buildEmailBodies(report, ['cc@example.com']);
    expect(originalReads).toBe(1);
    expect(bodies).toEqual({
      html: buildHtml(report, ['cc@example.com']),
      text: buildText(report, ['cc@example.com']),
    });
    expect(bodies.text.includes('הטקסט השגוי:')).toBe(proposedText === 'א ג');
  });

  it('prepares correction snippets for another source too, without a Sefaria link', () => {
    const report = {
      ...payload,
      correction: { originalLine: 'א ב', originalSelection: null, proposedText: 'א תיקון' },
    };
    const bodies = buildEmailBodies(report);
    expect(bodies).toEqual({ html: buildHtml(report), text: buildText(report) });
    expect(bodies.text).toContain('א *תיקון*');
    expect(bodies.text).not.toContain('קישור ישיר');
  });

  it('does not reuse stale snippets when a later report changes the proposal', () => {
    const report = {
      ...payload,
      source_folder: 'sefariaToOtzaria',
      correction: { originalLine: 'א ב', originalSelection: null, proposedText: 'א ג' },
    };
    expect(buildEmailBodies(report).text).toContain('א *ג*');
    report.correction.proposedText = 'א ד';
    const updated = buildEmailBodies(report);
    expect(updated.text).toContain('א *ד*');
    expect(updated.html).toContain('א *ד*');
    expect(updated.text).not.toContain('א *ג*');
  });
});
