[![pkg.pr.new](https://img.shields.io/badge/pkg.pr.new-Effect--TS%2Fui-black)](https://pkg.pr.new/~/Effect-TS/ui)

# Effect UI

A frontend framework for [Effect](https://github.com/Effect-TS/effect) whose apps are composed with Layers. A component is Schemas for its props, Model, messages and events, and pure `init`, `update` and `view` functions. Side effects are Commands and Subscriptions that the runtime runs, and data comes from queries (`Query`). The core is host-agnostic: `@effect/ui/html` renders to the DOM, and `@effect/ui-opentui` to terminals with OpenTUI.

The packages are experimental and not yet on npm: install them from [snapshots](#snapshots).

- [ui.effect.website](https://ui.effect.website): overview and interactive walkthrough
- [`LLMS.md`](LLMS.md): the guide and worked examples, generated from [`ai-docs/`](ai-docs)

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
    ClickedDecrement: ($) => $.evolve({ count: (count) => count - 1 }),
    ClickedIncrement: ($) => $.evolve({ count: (count) => count + 1 }),
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
| [`@effect/ui`](packages/ui/README.md)                   | The framework: a host-agnostic core, `@effect/ui/html` for the DOM, routing, server rendering and hydration, and test harnesses                                                 |
| [`@effect/ui-kit`](packages/ui-kit/README.md)           | Unstyled components for `@effect/ui`: see [its components](packages/ui-kit/README.md#components)                                                                                |
| [`@effect/ui-devtools`](packages/ui-devtools/README.md) | Message log inspector for `@effect/ui`: in-page overlay with Time travel, Node MCP server (with optional `dispatch`), experimental WebMCP, and `DevToolsHeadless` for terminals |
| [`@effect/ui-opentui`](packages/ui-opentui/README.md)   | OpenTUI terminal vocabulary and host for `@effect/ui`                                                                                                                           |

## Snapshots

Every pull request and every push to `main` publishes snapshot builds of all four packages to [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). Install one with the commit's short SHA, swapping in the package name:

```sh
pnpm add effect https://pkg.pr.new/Effect-TS/ui/@effect/ui@<sha>
```

Every package has `effect` v4 as a peer dependency, and the other three also need `@effect/ui`. `@effect/ui-devtools` needs `@effect/ui-kit` too, and `@effect/ui-opentui` has its own [requirements](packages/ui-opentui/README.md#requirements).

## Examples

`examples/` holds runnable apps, several of them ports of [Foldkit's examples](https://github.com/devinjameson/foldkit/tree/main/examples). Each one is a private workspace package that `pnpm check`, `pnpm lint` and `pnpm test` cover. Run one with `pnpm --filter <name> dev`. `snake-tui` is a terminal app: use `pnpm --filter snake-tui start` (Node) or `start:bun`.

| Example                                                   | Description                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`auth`](examples/auth)                                   | Authentication flow with guarded routes and a `SessionStore` service                         |
| [`canvas-art`](examples/canvas-art)                       | Interactive `<canvas>` animation using `Canvas` and `HtmlSubscription`                       |
| [`counter`](examples/counter)                             | The quick start above, with ui-kit `Button`s, `Head` updates and a `Story` test              |
| [`counters`](examples/counters)                           | Dynamic keyed list of child `Counter` components                                             |
| [`file-preview`](examples/file-preview)                   | File picker reading local files with `HtmlFiles` and switch-mode `Command`s                  |
| [`interrupting-commands`](examples/interrupting-commands) | Concurrent uploads demonstrating `Command` interruption and `@effect/ui-devtools`            |
| [`launch`](examples/launch)                               | The launch site deployed to [ui.effect.website](https://ui.effect.website)                   |
| [`routing`](examples/routing)                             | Typed routes, lazy-loaded pages, `Query`, and `NavigationMenu`                               |
| [`snake`](examples/snake)                                 | Snake game with keyboard Subscriptions, timers, and `@effect/ui-devtools`                    |
| [`snake-tui`](examples/snake-tui)                         | Terminal port of `snake` using `@effect/ui-opentui` and `DevToolsHeadless`                   |
| [`virtual-list`](examples/virtual-list)                   | Demos of `@effect/ui-kit`'s `VirtualList`: see [its README](examples/virtual-list/README.md) |
| [`web-components`](examples/web-components)               | Integrating third-party Web Components with `Html.customElement`                             |

## Development

The repository is a pnpm workspace, set up like the [Effect monorepo](https://github.com/Effect-TS/effect). `nix develop` (or direnv) provides the toolchain.

```sh
pnpm install
pnpm check        # type check sources, tests, examples and AI docs
pnpm test         # run the Vitest suites in watch mode (--run for a single run)
pnpm test-types   # run the TSTyche type tests
pnpm doctest      # run the examples in the JSDoc
pnpm lint         # oxlint and dprint
pnpm lint-fix     # fix lint errors and format
pnpm jsdocs       # report JSDoc diagnostics
pnpm circular     # check for circular imports
pnpm codegen      # regenerate the index.ts barrels
pnpm ai-docgen    # regenerate LLMS.md from ai-docs/src
pnpm build        # build every package
```

Add a changeset (`pnpm changeset`) to a pull request that changes a published package.

`packages/tools` holds private copies of the Effect monorepo's lint plugin, barrel codegen, JSDoc checker and AI docs generator, which aren't published to npm.
