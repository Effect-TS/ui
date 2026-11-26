[![pkg.pr.new](https://img.shields.io/badge/pkg.pr.new-Effect--TS%2Fui-black)](https://pkg.pr.new/~/Effect-TS/ui)

# Effect UI

A frontend framework for [Effect](https://github.com/Effect-TS/effect) whose apps are composed with `Layer`s.

Each component is a self-contained Elm Architecture program described with `Schema`s for its props, Model, messages, and events, alongside pure `init`, `update`, and `view` functions. Side effects run as `Command`s and `Subscription`s managed by the runtime, data fetching and caching come from `Query`, and the host-agnostic core renders to HTML/DOM (`@effect/ui/html`) or terminals via OpenTUI (`@effect/ui-opentui`).

> **Note:** These packages are experimental and in public preview (not yet published to npm).

- **Overview & interactive walkthrough:** [ui.effect.website](https://ui.effect.website)
- **Guide & worked examples (humans & AI agents):** [`LLMS.md`](LLMS.md) (generated from [`ai-docs/`](ai-docs))

## Quick start

```ts
import { UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { Effect, Layer, Schema } from "effect"

const CounterModel = Schema.Struct({
  count: Schema.Number
})

const CounterMessage = UiSchema.TaggedEnum({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {}
})

const Counter = Html.component({
  name: "Counter",
  model: CounterModel,
  message: CounterMessage
}).make({
  init: () => ({ count: 0 }),
  update: {
    ClickedDecrement: ($) => $.evolve({ count: (n) => n - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (n) => n + 1 }),
    ClickedReset: ($) => $.evolve({ count: 0 })
  },
  view: (h, model) =>
    h.div(
      h.p(String(model.count)),
      h.button.on("click", CounterMessage.ClickedDecrement()).children("-"),
      h.button.on("click", CounterMessage.ClickedReset()).children("Reset"),
      h.button.on("click", CounterMessage.ClickedIncrement()).children("+")
    )
})

const Main = BrowserHost.mount(Counter, {}, document.getElementById("root")!)

Layer.launch(Main).pipe(Effect.runFork)
```

## Packages

| Package                                                 | Description                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@effect/ui`](packages/ui/README.md)                   | Host-agnostic framework composed with Layers, plus `@effect/ui/html` for DOM rendering, routing, SSR/hydration, canvas, and Markdown, and testing harnesses                     |
| [`@effect/ui-kit`](packages/ui-kit/README.md)           | Unstyled accessible component library for `@effect/ui`: see [its components](packages/ui-kit/README.md#components)                                                              |
| [`@effect/ui-devtools`](packages/ui-devtools/README.md) | Message log inspector for `@effect/ui`: in-page overlay with Time travel, Node MCP server (with optional `dispatch`), experimental WebMCP, and `DevToolsHeadless` for terminals |
| [`@effect/ui-opentui`](packages/ui-opentui/README.md)   | OpenTUI vocabulary, terminal host, global Subscriptions, imperative Commands, and test harnesses for building terminal apps with `@effect/ui`                                   |

## Snapshots

Every pull request and every push to `main` publishes snapshot builds of all four packages (`@effect/ui`, `@effect/ui-kit`, `@effect/ui-devtools`, and `@effect/ui-opentui`) to [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). Install them using a commit's short SHA alongside `effect` v4:

```sh
pnpm add effect@^4.1.4 https://pkg.pr.new/Effect-TS/ui/@effect/ui@<sha>
```

The other packages follow the same URL pattern:

- `https://pkg.pr.new/Effect-TS/ui/@effect/ui-kit@<sha>` (peer dependencies: `effect`, `@effect/ui`)
- `https://pkg.pr.new/Effect-TS/ui/@effect/ui-devtools@<sha>` (peer dependencies: `effect`, `@effect/ui`, `@effect/ui-kit`; optional `@effect/platform-node` for `@effect/ui-devtools/node`)
- `https://pkg.pr.new/Effect-TS/ui/@effect/ui-opentui@<sha>` (peer dependencies: `effect`, `@effect/ui`, `@opentui/core@^0.9.9`; requires Node 26.4+ with `--experimental-ffi`, or Bun 1.3.14+)

## Examples

`examples/` holds runnable apps — including ports of [Foldkit's examples](https://github.com/devinjameson/foldkit/tree/main/examples) (`auth`, `counter`, `counters`, `interrupting-commands`, `routing`, `snake`) as well as Effect UI demos, the launch site, and a terminal app. Each example is a private workspace package covered by `pnpm check` and `pnpm lint` (and `pnpm test` where Vitest suites exist).

| Example                                                   | Description                                                                       | Run                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`auth`](examples/auth)                                   | Authentication flow with guarded routes and a `SessionStore` service              | `pnpm --filter auth dev`                                                     |
| [`canvas-art`](examples/canvas-art)                       | Interactive `<canvas>` animation using `Canvas` and `HtmlSubscription`            | `pnpm --filter canvas-art dev`                                               |
| [`counter`](examples/counter)                             | Minimal counter component with `Head` updates and a `Story` test                  | `pnpm --filter counter dev`                                                  |
| [`counters`](examples/counters)                           | Dynamic keyed list of child `Counter` components                                  | `pnpm --filter counters dev`                                                 |
| [`file-preview`](examples/file-preview)                   | File picker reading local files with `HtmlFiles` and switch-mode `Command`s       | `pnpm --filter file-preview dev`                                             |
| [`interrupting-commands`](examples/interrupting-commands) | Concurrent uploads demonstrating `Command` interruption and `@effect/ui-devtools` | `pnpm --filter interrupting-commands dev`                                    |
| [`launch`](examples/launch)                               | The launch site deployed to [ui.effect.website](https://ui.effect.website)        | `pnpm --filter launch dev`                                                   |
| [`routing`](examples/routing)                             | Typed routes, lazy-loaded pages, `Query`, and `NavigationMenu`                    | `pnpm --filter routing dev`                                                  |
| [`snake`](examples/snake)                                 | Snake game with keyboard Subscriptions, timers, and `@effect/ui-devtools`         | `pnpm --filter snake dev`                                                    |
| [`snake-tui`](examples/snake-tui)                         | Terminal port of `snake` using `@effect/ui-opentui` and `DevToolsHeadless`        | `pnpm --filter snake-tui start` (Node) / `pnpm --filter snake-tui start:bun` |
| [`virtual-list`](examples/virtual-list)                   | Interactive demos of `@effect/ui-kit`'s `VirtualList` layouts and scroll features | `pnpm --filter virtual-list dev`                                             |
| [`web-components`](examples/web-components)               | Integrating third-party Web Components with `Html.customElement`                  | `pnpm --filter web-components dev`                                           |

## Development

The repository is a pnpm workspace, set up like the [Effect monorepo](https://github.com/Effect-TS/effect). `nix develop` (or direnv) provides Node, pnpm, Bun, and Deno.

```sh
pnpm install
pnpm check        # type check sources, tests, examples and AI docs (effect-tsgo; use check-tsc for tsc)
pnpm test         # run Vitest suites in watch mode (pass --run for a single run)
pnpm test-types   # run the TSTyche type tests
pnpm doctest      # run the examples in the JSDoc
pnpm lint         # check linting and formatting (oxlint and dprint check)
pnpm lint-fix     # auto-fix lint issues and format (oxlint --fix and dprint fmt)
pnpm jsdocs       # check JSDoc coverage (effect-jsdocs)
pnpm circular     # check for circular imports
pnpm codegen      # regenerate the index.ts barrels
pnpm ai-docgen    # regenerate LLMS.md from ai-docs/src
pnpm build        # build every package and copy AI docs
```

Add a changeset (`pnpm changeset`) to a pull request that changes a published package.

`packages/tools` holds private copies of the Effect monorepo's lint plugin, barrel codegen, JSDoc checker, and AI docs generator, which aren't published to npm.
