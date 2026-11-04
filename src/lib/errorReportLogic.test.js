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

  it.each([
    ['א <B title="x">ב</B> ג', 'א ב ג'],
    ['א <span title="a < b">ב</span> ג', 'א ב ג'],
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
    expect(otherSource).toContain('פירוט הטעות:');
    expect(otherSource).not.toContain('הטקסט השגוי');
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

  it('does not prepare correction snippets for another source', () => {
    const report = {
      ...payload,
      correction: {
        get originalLine() { throw new Error('A non-Sefaria correction must not be parsed'); },
        originalSelection: null,
        proposedText: 'תיקון',
      },
    };
    expect(buildEmailBodies(report)).toEqual({ html: buildHtml(report), text: buildText(report) });
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
