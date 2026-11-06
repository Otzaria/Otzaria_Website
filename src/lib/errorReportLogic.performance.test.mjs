import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('maximum valid Sefaria corrections with unterminated tags have bounded rendering work', (t) => {
  // Run the synchronous workload in a separate process so a quadratic-regex
  // regression can be stopped. This is a generous batch watchdog, not a tight
  // millisecond assertion: the linear implementation finishes in well under a
  // second locally, while the old regex needs seconds for EACH rendered mail.
  const script = `
    import assert from 'node:assert/strict';
    import { buildEmailBodies, normalizePayload } from ${JSON.stringify(new URL('./errorReportLogic.js', import.meta.url).href)};
    import { LIMITS, validateIntakePayload } from ${JSON.stringify(new URL('./corrections/payload.js', import.meta.url).href)};

    const original = '<a'.repeat(LIMITS.originalLine / 2);
    const proposed = '</b'.repeat(Math.ceil(LIMITS.proposedText / 3)).slice(0, LIMITS.proposedText);
    const raw = {
      schema_version: 2,
      report_id: 'unterminated-tags',
      report_kind: 'text_correction',
      source_folder: 'sefariaToOtzaria',
      book_title: 'בראשית',
      current_ref: 'בראשית א',
      error_details: '--- הצעת תיקון ---\\n' + original + '\\n' + proposed,
      correction: {
        original_line: original,
        original_selection: '',
        selection_offset: { unit: 'utf16_code_units', start: original.length, end: original.length },
        proposed_text: proposed,
        context_before: original,
        context_after: '',
      },
    };
    assert.ok(Buffer.byteLength(JSON.stringify(raw)) < LIMITS.bodyBytes);
    const validated = validateIntakePayload(raw);
    assert.equal(validated.ok, true);
    const payload = { ...normalizePayload(raw), correction: validated.correction };
    const wrong = 'הטקסט השגוי:\\n' + original;
    const fixed = 'הטקסט המתוקן:\\n*' + original + proposed + '*';
    const start = process.cpuUsage();
    for (let i = 0; i < 64; i++) {
      const bodies = buildEmailBodies(payload);
      assert.ok(bodies.text.includes(wrong));
      assert.ok(bodies.text.includes(fixed));
      // Short needles keep assertion work cheap on these highly repetitive
      // strings; the complete original/proposed text is checked above.
      assert.ok(bodies.html.includes('*&lt;a&lt;a'));
      assert.ok(bodies.html.includes('&lt;/b&lt;/b'));
      assert.ok(!bodies.html.includes('<a<a'));
    }
    const cpu = process.cpuUsage(start);
    console.log(JSON.stringify({ iterations: 64, cpuMs: (cpu.user + cpu.system) / 1000 }));
  `;
  const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '--eval', script], {
    encoding: 'utf8',
    timeout: 15_000,
    // Ensure even a synchronous regression cannot leave the worker running.
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const metrics = JSON.parse(result.stdout);
  assert.equal(metrics.iterations, 64);
  t.diagnostic(`64 maximum-size reports: ${metrics.cpuMs.toFixed(1)}ms CPU`);
});
