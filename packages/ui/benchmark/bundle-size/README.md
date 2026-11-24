# Bundle size

Bundle sizes of small @effect/ui clients, bundled with Vite against the packed @effect/ui and @effect/ui-kit as an external consumer would. Run from the repository root, after `pnpm build`:

```sh
pnpm bundle-size [--app <name>]... [--development] [--json <file>] [--base <file>]
```

Apps: `counter` (`counter.ts`), `features` (`features.ts`: a Layer, a slot, a failure fallback and the message log) and `routing` (`examples/routing`). Every app is measured unless `--app` picks some. Each bundle runs in happy-dom before it counts. Added gzip bytes are an app's total minus a separately bundled effect-only client.

| Option          | Effect                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `--development` | bundle without the `production` export condition, keeping development-only checks               |
| `--json`        | write the result to a file                                                                      |
| `--base`        | add deltas against an earlier `--json` file; an older single-app file compares the counter only |

The table is also appended to `$GITHUB_STEP_SUMMARY` when that is set.
