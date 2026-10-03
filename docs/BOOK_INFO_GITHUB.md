# Book information PRs and CI identity updates

`ForDB/book_info.csv` on `Otzaria/otzaria-library@main` is authoritative. Mongo
stores pending requests, publication intent, reservations and synchronization
state. The website reads the CSV and `ForDB/book_info_identity.json` from the
same immutable commit. The library's cleaner records exact per-author title
renames and orphan removals in that append-only ledger; site author edits append
a `changeSetId` event in the same commit as their CSV edit.

## Deployment

- Provide `DICTA_LIBRARY_GITHUB_TOKEN` with the existing repository write access
  and `CRON_SECRET`. Provision an external cron calling `/api/cron/book-info-sync`
  every minute with the existing cron authorization header. The endpoint allows
  up to 120 seconds; the sync queue starts no further document after its
  60-second budget. No production configuration is changed by this PR.
- Mongo supports the partial unique `active_book_unique` index on `bookKey`,
  restricted to `publishing`, `open`, `modified`, and `conflict`. The server
  explicitly ensures this index before accepting a request, including deployments
  with `autoIndex` disabled. Existing ordinary indexes need not be dropped.
  If previous active duplicates exist, index creation fails and publication stops;
  review their PRs and resolve terminal statuses before retrying. Requests are
  never deleted to make index migration pass.
- The new `BookInfoSyncState` collection stores an atomic expiring lease, pacing,
  source/cache versions and the trusted identity revision/hash. Never rewrite or
  truncate the ledger: the website and library CI reject changed history.
- Existing PR records without a baseline/revision are hydrated once from their
  recorded immutable `baseSha`. Missing or unverifiable source identities become
  visible conflicts requiring review rather than guesses or automatic closure.

## Synchronization behavior

Each cron invocation handles at most ten records, oldest `checkedAt` first. It
compares CSV and ledger blob SHAs, so README or unrelated main commits produce
no CSV uploads, branch updates or PR edits. Actual metadata changes are paced
at 1,500 ms between writes, with spacing and `Retry-After` backoff persisted in
Mongo. Concurrent workers share the Mongo lease, and revision-checked writes
reject stale state. A 100-request queue may require several cron invocations;
submission checks the particular blocking PR on demand, and checks stale user
quota records only when the quota is full, so a deferred merged/closed PR does
not prevent a new request.

Generated commits and their intended PR text are persisted before a branch is
exposed or advanced. Rebuilds preserve history using parents of the known bot
head and current main, then GitHub's atomic `force:false` fast-forward update.
A concurrent human push cannot be overwritten. Recovery trusts only the saved
generated SHA. A manual head remains `modified`; its actual merge/closure is
still monitored. After a partial interruption, the next worker finishes the
saved intent rather than treating a bot commit as a human edit.

Every operation retains its source row and identity revision. Replaying only
later ledger events follows repeated title renames without redirecting a newly
reused title. A touched value changed by another editor, an invalid complete
row, a reservation collision, a removal, or an unverifiable identity remains
an explicit conflict with its PR and proposed values preserved. Review the
GitHub diff, resolve or close the PR, and submit a fresh edit when needed.

Snapshots have a 60-second fallback TTL and a shared Mongo source version that
invalidates other workers after a sync or fresh read. Older in-flight readers
cannot rewind a newer local snapshot. GET resolves pending identities using the
same snapshot ledger before cron has rebased branches. Missing-row proposals
appear in a separate visible conflict list. Open forms send only changed fields
and their original values/revision so refreshes cannot turn stale fields into
unintended edits. The table renders 100 rows per page; search covers all rows.

Legacy proposals retain their CSV identity, source revision, original values,
and previous transferred change-set ID. A remaining year field follows an
approved author transition; a conflicting selected author proposal is retained
for review. Publication does not mutate Mongo's old approved `BookInfo` record.

## Storage contract and verification

CSV is six columns, LF UTF-8 without BOM/CR/NUL or malformed quoting. Years are
empty or signed Int32 integers; start must not exceed end. Generation and
subgeneration must use the shared supported pair. Quoted LF and ordinary astral
characters are supported; lone UTF16 surrogates are refused before UTF8 encoding.
Export round-trips through the reader and sorts Unicode code points to match
Python producers.

Run:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/bookinfo/*.test.mjs
node_modules/.bin/vitest run
node_modules/.bin/tsc --noEmit
```

The book-info integration suite uses real disposable Mongo and fake GitHub REST
mutations. Its CI bridge fixture is actual output from the library's production
`validate_fordb_book_names.py --fix` CLI with a chained title rename, two authors
and an orphan prune. It also covers human races, lost responses, worker death,
lease expiry, quota/reservation tails, ledger rewriting, stale forms, legacy
partial transfer, filtered cursor pagination and cache overlap. No production
Mongo or GitHub data is modified by the tests.
