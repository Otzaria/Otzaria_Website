# PDF conversion benchmark

Run `npm run bench:pdf` after `npm ci`. The script creates a deterministic multi-page PDF, runs the **production** `convertPdfToImages` function, and deletes temporary output even if conversion fails.

Override fixture and run count with `PDF_BENCH_PAGES` (default 12), `PDF_BENCH_ROUNDS` (3), `PDF_BENCH_WIDTH` (1200), `PDF_BENCH_HEIGHT` (1600), and `PDF_BENCH_SCALE` (2).

The JSON report includes elapsed conversion time, sampled peak process RSS, p99 event-loop delay, output dimensions, byte counts and SHA-256 hashes for each page. For comparisons, use the same machine, Node version, sharp/pdfjs versions and input parameters. The output hash checks are useful for detecting changes, **not** a guarantee of identical visual quality across native library versions.

RSS is process-wide and sampled every 10 ms, so brief peaks may be missed; the event-loop histogram has 10 ms resolution. Elapsed time, peak RSS and event-loop p99 all cover PDF conversion and JPEG writing. Both monitors stop before reading output files, checking metadata and calculating SHA-256 hashes. Run a warm-up round separately when comparing warm performance.

This is measurement infrastructure only. It does not claim that direct-resolution rendering is safe or faster. Test visual output and PDF resource cleanup before changing the production pipeline.
