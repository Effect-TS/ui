# Rows benchmark

The keyed-table benchmark (js-framework-benchmark's operations) for @effect/ui, and the same table on React as a baseline, in headless Chromium: rendering times and JS heap sizes.

Run from the repository root:

```sh
node packages/ui/benchmark/rows/run.mjs [--rounds 5] [--ops create1k,swap] [--variants plain]
  [--memory-only | --time-only | --ssr-only] [--profile plain:replace1k] [--chromium <path>]
```

The browser is `--chromium`, else `$CHROMIUM`, else `chromium` on PATH, else the Chromium that the `playwright` dev dependency installed. `entry.ts` is bundled with esbuild (minified IIFE, es2023, production) straight from `packages/ui/src`, so it measures the working tree. The bundle goes to `scratchpad/rows.bundle.js`; delete it when done.

## Variants

Variants render the same table (see `harness.ts`): @effect/ui's `plain` (one component), `lazy` (`plain` with each row behind `h.lazy`), `component` (a child component per row) and `titled` (`component` with a title in the table's head), and React's `react-plain`, `react-component` (a row component, unmemoized) and `react-memo` (a row component under React.memo); see `react.mjs`. The default is @effect/ui's `plain` and `component`. React variants run from `scratchpad/rows-react.bundle.js`, built the same way from `react.mjs` with the React in @effect/ui's dev dependencies (the run prints its version), so a page loads one framework only.

## Times

Times, in milliseconds from the message (or click) to the first microtask after the change is in the DOM. Style, layout and paint are not included:

| Operation    | What changes                      |
| ------------ | --------------------------------- |
| `create1k`   | 1,000 rows into an empty table    |
| `replace1k`  | 1,000 new rows over 1,000         |
| `update10th` | every 10th label of 1,000 changes |
| `select`     | a click selects one of 1,000 rows |
| `swap`       | rows 2 and 999 of 1,000 swap      |
| `remove`     | a click removes one of 1,000 rows |
| `create10k`  | 10,000 rows into an empty table   |
| `append1k`   | 1,000 rows after 1,000            |
| `clear1k`    | 1,000 rows removed                |

Protocol. Per round, a fresh page per variant and operation runs 2 unmeasured and 9 measured steps (`create10k`: 1 and 3), each after its setup; the round's figure is their median. The table shows the median across rounds and the range (min-max). Variant order rotates each round.

## Memory

Memory, in MiB (2^20 bytes) of used JS heap after a forced garbage collection, on a fresh page per variant and round: `ready` once mounted, then `1k` after 1,000 rows, `replace` after replacing them 5 times, `cycle` after 5 create-then-clear cycles of 1,000 rows (back to an empty table, so it tracks `ready` unless something is retained) and `10k` after 10,000 rows.

## Server rendering and hydration

Server rendering and hydration, in milliseconds, of the same table holding 1,000 rows, on a fresh page per variant and round, with 2 unmeasured and 9 measured runs (the round's figure is their median): `render` is `HtmlServer.renderToHtml` plus `serializeState`, `hydrate` is `HtmlHydrate.hydrateEffect` over that HTML with its state until `adopted`. Both run in the page, so they use the browser's engine, not Node's. Separately, first-hydrate measures one mount-to-adopted sample per fresh client page, using HTML and state rendered on another page. Neither DOM parsing nor bundle load is timed.

## Profiling

`--profile variant:op` profiles 20 steps of one operation, from an unminified bundle, and prints the functions with the most self time across them (line numbers are the bundle's). The last step's profile goes to `scratchpad/rows-<variant>-<op>.cpuprofile`. The ops `render` and `hydrate` profile that phase of 20 server renders of 1k rows.

Treat results as exploratory: compare paired runs of the same command across revisions on one machine; absolute figures depend on the machine and the browser.
