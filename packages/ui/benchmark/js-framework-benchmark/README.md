# js-framework-benchmark

Effect UI and Foldkit 0.x next to React, Vue, Svelte, Solid and vanilla JS on [krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the keyed table benchmark that most UI frameworks publish numbers for.

The harness already has entries for Foldkit and the other frameworks. `effect-ui/` is the entry for Effect UI. It isn't in the harness, and it doesn't need `@effect/ui` on npm: `run.sh` builds `packages/ui` from this checkout, packs it the way `pnpm publish` would, and installs the tarball. The version in the results is the commit.

## Results

Measured on 2026-11-23 with harness revision [`0f4e789`](https://github.com/krausest/js-framework-benchmark/tree/0f4e78932bf85ed60b163b801bbdbd720fdda54f), headless Chromium 153.0.8010.52, Node 26.13 and Linux 6.18, on a shared Azure VM with an AMD EPYC 7763 (16 vCPUs) and 62 GB of RAM. Effect UI is commit `f4a8d05`.

There were two full runs of the harness's defaults: 15 iterations of each CPU benchmark and one of each memory and size benchmark. The first run went through the frameworks in the order of the tables and the second in reverse, because other jobs share the VM. The load average when each framework started is in `results/*/load.txt`. It was 37 at the start of the first run and below 1 near the end of the second.

Each cell is the median of both runs' values pooled. Lower is better everywhere.

| CPU, total (ms)       | vanillajs | effect-ui |  foldkit | react-hooks |      vue |   svelte |    solid |
| --------------------- | --------: | --------: | -------: | ----------: | -------: | -------: | -------: |
| create 1,000 rows     |       107 |       126 |      145 |         127 |      130 |      111 |      110 |
| replace 1,000 rows    |       113 |       136 |      164 |         143 |      141 |      128 |      125 |
| update every 10th row |      45.5 |      68.3 |     73.3 |        63.6 |     55.7 |     52.1 |     57.5 |
| select row            |       9.9 |      17.8 |     20.1 |        18.8 |     12.6 |     16.9 |     12.1 |
| swap rows             |      52.5 |      72.8 |     63.3 |         524 |     58.5 |     65.4 |     64.1 |
| remove row            |      51.5 |      54.3 |     48.6 |        53.2 |     58.2 |     55.4 |     55.3 |
| create 10,000 rows    |      1231 |      1319 |     1471 |        1599 |     1328 |     1268 |     1202 |
| append 1,000 rows     |       120 |       140 |      158 |         138 |      143 |      133 |      129 |
| clear 1,000 rows      |      40.9 |      48.0 |     70.0 |        80.3 |     53.7 |     45.0 |     54.9 |
| **vs vanilla**        |  **1.00** |  **1.26** | **1.39** |    **1.70** | **1.20** | **1.16** | **1.14** |

| CPU, script (ms)      | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| --------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| create 1,000 rows     |       7.1 |      24.2 |    41.7 |        24.7 | 24.6 |   11.6 |  10.7 |
| replace 1,000 rows    |      14.6 |      35.8 |    56.3 |        42.3 | 35.1 |   24.4 |  21.3 |
| update every 10th row |       1.1 |      18.6 |    25.3 |        13.6 |  7.1 |    3.7 |   3.7 |
| select row            |       0.8 |       8.3 |    10.8 |         8.9 |  3.7 |    7.4 |   2.8 |
| swap rows             |       0.7 |      12.5 |     8.6 |        69.1 |  3.6 |    4.6 |   3.2 |
| remove row            |       1.0 |       4.3 |     4.2 |         3.7 |  8.8 |    2.0 |   1.1 |
| create 10,000 rows    |      71.8 |       188 |     398 |         441 |  209 |    110 |  94.4 |
| append 1,000 rows     |       7.5 |      27.7 |    44.7 |        26.1 | 23.4 |   12.8 |  11.1 |
| clear 1,000 rows      |      35.0 |      42.8 |    64.5 |        74.0 | 49.0 |   39.2 |  48.3 |

| Memory and size           | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| ------------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| ready memory (MB)         |       0.6 |       1.5 |     2.3 |         1.2 |  0.9 |    0.7 |   0.6 |
| run memory (MB)           |       1.9 |       4.2 |     6.1 |         4.4 |  3.9 |    2.9 |   2.7 |
| create/clear 5 times (MB) |       0.7 |       2.0 |     2.8 |         2.0 |  1.2 |    1.0 |   0.8 |
| uncompressed size (kB)    |      11.3 |       235 |     302 |         190 | 64.3 |   26.6 |  11.5 |
| compressed size (kB)      |       2.5 |      70.3 |    86.8 |        51.4 | 23.3 |    9.7 |   4.5 |
| first paint (ms)          |      83.5 |       516 |     688 |         405 |  162 |    150 |   193 |

| vs vanilla (total), per run | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| --------------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| results/pass1               |      1.00 |      1.16 |    1.32 |        1.54 | 1.11 |   1.08 |  1.01 |
| results/pass2               |      1.00 |      1.29 |    1.42 |        1.81 | 1.24 |   1.21 |  1.22 |

`vs vanilla` is the geometric mean, over the nine CPU benchmarks, of each framework's median total over vanilla JS's. It's unweighted, unlike the harness's own result page. Vanilla JS ran in the quietest part of the second run, which is why every framework's ratio is higher there. Compare frameworks within a run, not the two runs with each other. The order of the frameworks is the same in both.

`total` is the harness's duration from the click to the end of the next paint, read from the Chrome trace. On this VM, painting 1,000 rows takes about 100 ms whatever the framework, so the `script` table (the JavaScript that ran in that window) separates the frameworks better. Sizes and first paint are one sample per run, so treat them as rough. The harness slows the CPU down 4 times for update every 10th row, select row, swap rows and clear 1,000 rows, and 2 times for remove row, so those rows of the tables are 4 (or 2) times what the same work takes at full speed.

## What the results say

In script time, Effect UI is ahead of Foldkit 0.x on every operation except swap rows (12.5 ms against 8.6 ms) and remove row (about 4 ms for both). It runs less than half the JavaScript to create 10,000 rows (188 ms against 398 ms), uses about 30% less memory, and its bundle is 70 kB compressed against Foldkit's 87 kB.

Effect UI is also ahead of React overall. React's 524 ms swap rows makes the gap look larger than it is. That's a known cost of how React moves keyed rows when two distant ones trade places. Without swap rows, `vs vanilla` is 1.25 for Effect UI and 1.37 for React. Effect UI is clearly ahead on creating 10,000 rows (188 ms of script against 441 ms) and on clearing, about level on creating 1,000 rows and on select row, and behind on update every 10th row (18.6 ms against 13.6 ms). Vue, Svelte and Solid are ahead of both.

The gap is widest on small updates. Updating every 10th row, selecting a row and swapping two rows cost Effect UI 8 to 19 ms of script with the CPU slowed down 4 times, about 2 to 5 ms at full speed. Vue, Svelte and Solid need about 3 to 7 ms slowed down. In Effect UI each message runs `update`, then the whole `view`, and `h.lazy` compares the arguments of all 1,000 rows to find the few that changed. Svelte and Solid track which DOM nodes depend on which state and write only those, so their cost follows the size of the change, not the size of the table. Creating rows is closer, since every framework has to build every row.

The two Effect frameworks ship the largest bundles, 70 kB and 87 kB compressed, and have the slowest first paint: 516 ms for Effect UI and 688 ms for Foldkit, against 150 to 405 ms for the others.

## What the workloads measure

| Benchmark                        | What happens                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| create 1,000 rows                | 1,000 rows into an empty table, after 5 warm-up runs                       |
| replace 1,000 rows               | 1,000 new rows over 1,000 existing ones                                    |
| update every 10th row            | the label of every 10th row of 1,000 gets `!!!` appended (16 warm-up runs) |
| select row                       | a click on a row's label highlights it                                     |
| swap rows                        | rows 2 and 999 of 1,000 swap places                                        |
| remove row                       | a click removes one of 1,000 rows                                          |
| create 10,000 rows               | 10,000 rows into an empty table                                            |
| append 1,000 rows                | 1,000 rows after 1,000 existing ones                                       |
| clear 1,000 rows                 | all 1,000 rows removed                                                     |
| ready memory                     | JS heap after the page loads                                               |
| run memory                       | JS heap after creating 1,000 rows                                          |
| create/clear 5 times             | JS heap after creating and clearing 1,000 rows 5 times                     |
| uncompressed and compressed size | the JavaScript the page loads                                              |
| first paint                      | from navigation to the first paint                                         |

Every entry renders the same DOM, and the harness checks that each one is keyed: a row's DOM node follows its data when rows move or are removed. The Effect UI entry, like the Foldkit one, puts each row behind its lazy helper (`h.lazy` and `createKeyedLazy`), so a row whose data and selection haven't changed isn't built again.

## Versions

| Entry         | Package                | Version          |
| ------------- | ---------------------- | ---------------- |
| `effect-ui`   | `@effect/ui`, `effect` | `f4a8d05`, 4.1.5 |
| `foldkit`     | `foldkit`, `effect`    | 0.171.0, 4.1.5   |
| `react-hooks` | `react`                | 19.2.0           |
| `vue`         | `vue`                  | 3.5.39           |
| `svelte`      | `svelte`               | 5.42.1           |
| `solid`       | `solid-js`             | 1.9.3            |
| `vanillajs`   |                        |                  |

The React, Vue, Svelte, Solid and vanilla JS entries are the harness's own, installed from its lockfiles. The Foldkit entry is the harness's too, moved from 0.170.0 to 0.171.0 and from Effect 4.1.0 to 4.1.5 so that both Effect frameworks use the same Effect.

## Reproducing

From the repository root, inside `nix develop`, with Chromium on `PATH` (or `$CHROMIUM` set):

```sh
pnpm install
packages/ui/benchmark/js-framework-benchmark/run.sh ../js-framework-benchmark
```

The argument is where the harness is cloned, outside this repository. `run.sh` clones the harness at the pinned revision with only the seven entries, installs it, builds and packs `@effect/ui`, builds every entry, starts the harness's server on port 8080, checks that every entry is keyed and runs the benchmarks one framework at a time. A run takes about an hour. Arguments after the directory go to the harness, for example `--count 3 --benchmark 01_ 07_` for a quick check.

To summarize one or more runs:

```sh
node packages/ui/benchmark/js-framework-benchmark/summarize.mjs <results dir>...
```

## Files

| Path                             | What it is                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `effect-ui/`                     | the harness entry for Effect UI                                                                                                  |
| `run.sh`                         | sets up the harness and runs it                                                                                                  |
| `summarize.mjs`                  | turns the harness's result files into the tables above                                                                           |
| `results/pass1`, `results/pass2` | the harness's raw result files from the two runs, with every iteration's value, and the load average when each framework started |
