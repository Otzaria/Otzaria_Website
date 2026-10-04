This fixture was produced by the actual otzaria-library validator CLI:
`validate_fordb_book_names.py --fix --rename-base <fixture-base>`.
A disposable Git repository renamed the book twice, retained its two authors,
and pruned an orphan. Input, output and the append-only identity ledger are
unmodified CLI artifacts. The website integration test submits edits before
these CI changes and verifies the resulting pending branches and conflict.
