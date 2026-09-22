# E2E tests

Playwright is the **primary** testing mechanism for this project. Read
`AGENTS.md` section 10 before adding anything here — the rules are deliberate
and unusual.

## The short version

- Prefer E2E over unit tests. Most features need nothing else.
- Never write a unit test after writing the code.
- Do not pick the simplest scenario that proves the happy path. Pick a
  medium-to-hard one: real state, edge timing, multiple actors.
- No tautological tests. No change-detector tests. No reflexive regression
  tests for bug fixes.

## Running

```bash
pnpm e2e                    # full suite
pnpm e2e:ui                 # interactive
E2E_RUN_ID=my-run pnpm e2e  # name the artifact directory
```

Browser binaries are **not** installed yet — no specs exist. Before the first
spec lands, run `pnpm exec playwright install chromium`.

## Artifact contract

Every run writes `e2e/artifacts/<run-id>/`:

| File | Contents |
| --- | --- |
| `summary.json` | Assertions and invariant checks |
| `report/` | HTML report |
| `test-results/` | Traces, screenshots, video on failure |
| `state.json` | Dump of derived state — points ledger, progress rollups |

Same seed plus same fixed clock must produce the same artifact. Artifacts are
gitignored; the contract is not.

## Determinism rules

- Seed from a fixture cohort, never from live data.
- Freeze the clock. Deadline behaviour is a feature here (`is_late`), so time
  must be controlled, not observed.
- `timezoneId` is pinned to `Africa/Lagos` — participants see cohort time.
- Retries are off. A flaky test is a broken test.
