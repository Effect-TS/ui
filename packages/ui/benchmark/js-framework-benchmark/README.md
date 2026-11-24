# js-framework-benchmark

Effect UI and Foldkit 0.x next to React, Vue, Svelte, Solid and vanilla JS on [krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the keyed table benchmark that most UI frameworks publish numbers for.

The harness already has entries for Foldkit and the other frameworks. `effect-ui/` is the entry for Effect UI. It isn't in the harness, and it doesn't need `@effect/ui` on npm: `run.sh` builds `packages/ui` from this checkout, packs it the way `pnpm publish` would, and installs the tarball. The version in the results is the commit.

## Results

Measured on 2026-11-24 with harness revision [`0f4e789`](https://github.com/krausest/js-framework-benchmark/tree/0f4e78932bf85ed60b163b801bbdbd720fdda54f), headless Chromium 153.0.8010.52, Node 26.13 and Linux 6.18, on a shared Azure VM with an AMD EPYC 7763 (16 vCPUs) and 62 GB of RAM. Effect UI is commit `9f24dbe`.

There were two full runs of the harness's defaults: 15 iterations of each CPU benchmark and one of each memory and size benchmark. The first run went through the frameworks in the order of the tables and the second in reverse, because other jobs share the VM. The load average when each framework started is in `results/*/load.txt`. It stayed below 6 through the first run. The second run started at 19 and was back below 8 by React, so Solid, Svelte and Vue ran in the noisiest part of it.

Each cell is the median of both runs' values pooled. Lower is better everywhere.

| CPU, total (ms)       | vanillajs | effect-ui |  foldkit | react-hooks |      vue |   svelte |    solid |
| --------------------- | --------: | --------: | -------: | ----------: | -------: | -------: | -------: |
| create 1,000 rows     |       104 |       124 |      158 |         131 |      123 |      111 |      115 |
| replace 1,000 rows    |       110 |       142 |      172 |         170 |      142 |      121 |      129 |
| update every 10th row |      50.2 |      74.1 |     77.5 |        68.0 |     71.2 |     56.4 |     48.5 |
| select row            |      10.5 |      16.4 |     20.4 |        20.8 |     14.7 |     17.2 |     12.1 |
| swap rows             |      58.6 |      63.0 |     60.2 |         492 |     73.2 |     70.4 |     96.3 |
| remove row            |      48.0 |      53.3 |     48.1 |        51.7 |     69.6 |     55.4 |     67.8 |
| create 10,000 rows    |      1127 |      1284 |     1510 |        1549 |     1380 |     1233 |     1312 |
| append 1,000 rows     |       116 |       140 |      159 |         142 |      139 |      130 |      135 |
| clear 1,000 rows      |      37.0 |      51.5 |     64.9 |        77.9 |     61.0 |     40.8 |     53.1 |
| **vs vanilla**        |  **1.00** |  **1.26** | **1.42** |    **1.77** | **1.33** | **1.17** | **1.23** |

| CPU, script (ms)      | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| --------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| create 1,000 rows     |       7.0 |      24.6 |    45.6 |        25.8 | 23.4 |   11.5 |  10.9 |
| replace 1,000 rows    |      14.5 |      34.0 |    60.3 |        48.1 | 34.5 |   23.1 |  22.6 |
| update every 10th row |       1.4 |      18.3 |    28.6 |        14.5 |  8.2 |    4.0 |   3.2 |
| select row            |       1.1 |       7.1 |    10.8 |         9.6 |  3.8 |    7.4 |   2.6 |
| swap rows             |       0.8 |       6.7 |     8.5 |        64.2 |  4.2 |    5.2 |   4.2 |
| remove row            |       1.0 |       3.3 |     4.2 |         3.5 | 10.1 |    1.9 |   1.5 |
| create 10,000 rows    |      69.8 |       182 |     415 |         430 |  231 |    109 |   104 |
| append 1,000 rows     |       7.4 |      26.1 |    44.4 |        26.2 | 23.2 |   11.9 |  11.7 |
| clear 1,000 rows      |      31.9 |      45.6 |    59.7 |        72.0 | 54.7 |   35.8 |  47.2 |

| Memory and size           | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| ------------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| ready memory (MB)         |       0.6 |       1.2 |     2.3 |         1.2 |  0.9 |    0.7 |   0.6 |
| run memory (MB)           |       1.9 |       4.2 |     6.1 |         4.4 |  3.9 |    2.9 |   2.7 |
| create/clear 5 times (MB) |       0.6 |       1.6 |     2.8 |         1.9 |  1.2 |    1.0 |   0.8 |
| uncompressed size (kB)    |      11.3 |       169 |     302 |         190 | 64.3 |   26.6 |  11.5 |
| compressed size (kB)      |       2.5 |      51.7 |    86.8 |        51.4 | 23.3 |    9.7 |   4.5 |
| first paint (ms)          |      76.3 |       385 |     685 |         547 |  193 |   90.5 |  78.2 |

| vs vanilla (total), per run | vanillajs | effect-ui | foldkit | react-hooks |  vue | svelte | solid |
| --------------------------- | --------: | --------: | ------: | ----------: | ---: | -----: | ----: |
| results/pass1               |      1.00 |      1.34 |    1.40 |        1.74 | 1.19 |   1.13 |  1.16 |
| results/pass2               |      1.00 |      1.16 |    1.42 |        1.79 | 1.49 |   1.18 |  1.44 |

`vs vanilla` is the geometric mean, over the nine CPU benchmarks, of each framework's median total over vanilla JS's. It's unweighted, unlike the harness's own result page. Solid, Svelte and Vue ran under load in the second run, which is why their ratios are higher there. Compare frameworks within a run, not the two runs with each other. The order of the frameworks is the same in both.

`total` is the harness's duration from the click to the end of the next paint, read from the Chrome trace. On this VM, painting 1,000 rows takes about 100 ms whatever the framework, so the `script` table (the JavaScript that ran in that window) separates the frameworks better. Sizes and first paint are one sample per run, so treat them as rough. The harness slows the CPU down 4 times for update every 10th row, select row, swap rows and clear 1,000 rows, and 2 times for remove row, so those rows of the tables are 4 (or 2) times what the same work takes at full speed.

## What the results say

In script time, Effect UI is ahead of Foldkit 0.x on all nine operations. It runs less than half the JavaScript to create 10,000 rows (182 ms against 415 ms), uses about 30% less memory with 1,000 rows (4.2 MB against 6.1 MB), and its bundle is 51.7 kB compressed against Foldkit's 86.8 kB.

Effect UI is also ahead of React overall. React's 492 ms swap rows makes the gap look larger than it is. That's a known cost of how React moves keyed rows when two distant ones trade places. Without swap rows, `vs vanilla` is 1.29 for Effect UI and 1.45 for React. Effect UI is clearly ahead on creating 10,000 rows (182 ms of script against 430 ms), replacing rows and clearing, about level on creating and appending 1,000 rows, and behind on update every 10th row (18.3 ms against 14.5 ms). Svelte and Solid are ahead of both. Vue is ahead on the small updates and behind Effect UI on creating 10,000 rows.

The gap is widest on small updates. Updating every 10th row, selecting a row and swapping two rows cost Effect UI 7 to 18 ms of script with the CPU slowed down 4 times, about 2 to 5 ms at full speed. Vue, Svelte and Solid need about 3 to 8 ms slowed down. In Effect UI each message runs `update`, then the whole `view`, and `h.lazy` compares the arguments of all 1,000 rows to find the few that changed. Svelte and Solid track which DOM nodes depend on which state and write only those, so their cost follows the size of the change, not the size of the table. Creating rows is closer, since every framework has to build every row.

Effect UI's bundle is now about the size of React's (51.7 kB against 51.4 kB compressed). Foldkit's is the largest at 86.8 kB. First paint is 385 ms for Effect UI and 685 ms for Foldkit, against 78 to 547 ms for the others, but it is one sample per run.

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
| `effect-ui`   | `@effect/ui`, `effect` | `9f24dbe`, 4.1.5 |
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
