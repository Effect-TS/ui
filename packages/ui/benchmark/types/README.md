# Type benchmarks

Measures the type-checking cost of scoped children against the same shapes written with `h`, as on `main`.

Run from the repository root:

```sh
node packages/ui/benchmark/types/run.mjs [--main] [--lsp] [--sessions <n>] [--json <file>] [--base <file>]
```

Counts are instantiations from `tsc --singleThreaded --extendedDiagnostics` (TypeScript 7) with the Effect plugin off. `--singleThreaded` makes the count independent of how files are split across checker threads.

| Flag            | Effect                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--lsp`         | Also times `tsc --lsp --stdio` on the 100-wide owner: diagnostics after an edit and a completion at `h.`, the median of 10 edits, for each of `--sessions` sessions that measure the inline owner and then the scoped one. |
| `--main`        | Writes only the inline fixtures, without `scoped`, for a checkout of `main`.                                                                                                                                               |
| `--json <file>` | Writes the results to `file`.                                                                                                                                                                                              |
| `--base <file>` | Reads a `--main` run's `--json` and compares with it.                                                                                                                                                                      |

The script exits non-zero when a scoped shape goes over its ceiling.

## Fixtures

The fixtures are written to `tmp`. Each shape is written twice: with children written with `h`, as on `main`, and as scoped components written with the `s` of `h.scoped`.

| Shape    | What it is                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leaves` | 100 components, each with props, a Model, a message and one event.                                                                                                                                                                                                                 |
| `owner`  | One component over all 100: a third always there, a third behind a condition and a third from a list, every one with props and an `onEmit` handler. The scoped owner writes the first two thirds in a scope without a predicate and the lists in one with a predicate, in a `div`. |
| `deep`   | A chain of components, each one the child of the one above, 8 and 16 long.                                                                                                                                                                                                         |
