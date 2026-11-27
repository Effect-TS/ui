---
title: Introducing Effect UI
published: 2026-11-26
updated: 2026-11-27
---

Effect UI is a frontend library built on Effect and the Elm Architecture. Build web, terminal and native apps from self-contained Components with explicit state transitions and side effects as values, plus DevTools built for humans and agents.

Effect UI is in public preview. We built this page with it, and you can [read its source](https://github.com/Effect-TS/ui/tree/main/examples/launch) on GitHub.

## Explore with an AI agent

:::PageOnly
Not reading all that? Copy a prompt to explore Effect UI with an AI agent.
:::

:::AgentPrompts
::AgentPrompt{label="TL;DR" about="Paste into any AI agent that can read a web page." prompt="Read $URL. In under 200 words, explain what Effect UI is and list its key ideas and features, one line each. Use only what the page says, and say so when it doesn't cover something."}

::AgentPrompt{label="Compare" about="Paste into any AI agent, or a coding agent open in your project." prompt="Read $URL. Compare Effect UI to the UI library I use (if we're not in a project, ask me which one first) across components, state, data fetching, testing and DevTools. Use only what the page says about Effect UI, and say so when it doesn't cover something."}
:::

## Why Effect UI

Frontend apps get hard for the same reasons everywhere: tangled state, race conditions in async work and side effects scattered across callbacks. Effect UI puts every state transition in one pure function and handles async work, cancellation and errors with Effect. If you also use Effect on the server, the same programming model carries across the whole stack.

Like Effect itself, Effect UI and Effect UI Kit have zero third-party runtime dependencies. Typed routing, a query cache, shared state, server rendering, DevTools, testing harnesses and 51 headless UI modules all come built in, so you don't have to assemble a frontend stack out of half a dozen packages.

## Components

**A Component is a mini Elm Architecture program, and you build an app by composing Components.** Each Component defines its own Model, Messages, update and view. Messages go straight to their Component's update and re-render only that Component.

::Architecture

A Component is self-contained, so you can write, test and lazy-load it on its own, and provide its own services. If a Component fails, the rest of the app keeps running.

### Anatomy of a Component

This counter shows the core parts of a Component. One definition holds its Model, Messages, init, update, subscriptions and view.

::Counter{code="intro" label="Live auto-counter"}

Click "+1", then click the Effect UI button in the bottom-right corner. [DevTools](#devtools) lists the Message you sent and what it changed.

### Composing Components

This example builds a `Page` that shows or hides a `Counter`.

::Listing{code="counter" example="counter" whole="true"}

## DevTools

:::LauncherPointer
Effect UI has an inspector you can add with one Layer, `DevTools.layer`, or automatically in dev with `DevToolsVite.plugin`. It's running on this page, behind the Effect UI button in the bottom-right corner.

- **Timeline:** One list holds every Message from every Component, the Model after it and what changed.
- **Cause and effect:** For any entry, DevTools traces what sent the Message, the Commands it issued and how each one ended.
- **Element picker:** Click **Pick** to select any element on the page and jump to the Component instance that rendered it. Try it on this page.
- **Noise control:** Stop or resume recording noisy Message tags at runtime without editing code, and surface or filter declared payload fields in the timeline.
- **Time travel:** Pick an earlier entry to see the page at that point. The live app keeps running, and Resume returns to it.
- **For agents:** An MCP server (or WebMCP in the browser) lets agents read the log, inspect Component state and, if allowed, send Messages.

Terminal apps built with `@effect/ui-opentui` can stream their logs into the same browser inspector with `DevToolsHeadless.layer`.
:::

## Testing

### Play tests

**A Play test runs a whole user flow without a browser, module mocks or real timers.** It mounts a Component and its children on the [test host](#web-terminal-and-native), clicks through the UI, runs real Commands, Subscriptions and Query fetches against in-memory Layers, and checks what's on screen afterwards.

`TestClock` controls time, so delayed flows run instantly.

::PlayTest

### Story and Scene tests

To test one Component in isolation without running its Commands, a Story test sends Messages straight to `update`, and a Scene test drives it through the view. Both start from the Component's init Model or a state you supply with `given`, and resolve each Command by hand.

::Listing{code="tests"}

A test can also supply test values for everything around the Component: a Query's result, a Subscription's value, an event from a child, a Provider's value or new props from the parent.

`Story.check` runs property tests over Message and Command sequences generated from a Component's Schemas, shrinking any failure to minimal Story steps. For concurrency bugs, `Story.explore` exhaustively searches overlapping Message and Command settlement orders and reports the shortest failing path.

## Effect UI Kit

**`@effect/ui-kit` ships 51 modules**, so you don't have to build accessible UI from scratch. Each handles keyboard, focus and ARIA while you write the markup and styles, and you can build your own headless Components the same way.

Of those, 46 are headless components and 5 are lower-level primitives: `Dismissal`, `ListNavigation`, `Positioning`, `Typeahead` and `VirtualKeyboard`. The kit covers every component in [Base UI](https://base-ui.com/), plus `Calendar`, `RangeCalendar`, `DateField`, `DatePicker`, `FileDrop`, `SortableList`, `NavigationLinks`, `VirtualList` and `DirectionProvider`.

Here are all 51 modules. Hover or tap to animate.

::Kit

## Data and state

### Data fetching with Queries

**Define a Query once and list it on the Components that need it.** The runtime fetches the data, shares one cache across every Component and keeps loading and error states out of your Model.

- **Fetching:** Fetches on render and when arguments change, interrupting superseded fetches. Supports `debounce` and keeps the last result on screen.
- **Caching:** The runtime keeps one result per Query and arguments. Components that ask for the same data share one fetch.
- **Freshness:** A result older than `staleTime` stays on screen while the runtime refetches it.
- **States:** Each result is an `AsyncResult`: either no result yet, failure or success.

For live data such as WebSockets or server-sent events, `Query.StreamService` backs a Query entry with a shared `Stream`: each emitted value updates the cached result, and the stream closes when nothing watches it.

::Chips{label="Also built into Queries" items="polling, refetch on focus and reconnect, load more, invalidation from Commands, optimistic updates, prefetch on link hover, server rendering, restore on back and forward"}

::Listing{code="query" whole="true"}

### Shared state with Providers

A Provider shares part of its Model with Components inside it, at any depth. Components inside read that state and send the Provider Messages directly, without passing props or callbacks through the parents in between.

::Listing{code="provider"}

::Diagram{scenario="sharedState"}

## Web, terminal and native

Effect UI renders through a host instead of tying Components to the browser DOM. From the same HTML Components, the browser host renders DOM nodes, the server host writes HTML and the test host builds an in-memory tree.

**A Component works the same on every platform.** Only the platform-specific pieces change: the view elements, the host you mount onto and the effects that interact with them. For example, `Html.component` and `HtmlCommand.focus` target the web, `OpenTui.component` and `OpenTuiCommand.focus` in `@effect/ui-opentui` target the terminal, and `Native.component` in `@effect/ui-native` renders React Native views directly through Fabric without React. The host interface is public if you want to build your own.

## Also included

- **Typed routing:** Define routes with Schema-typed path and search params in `Route`, then back navigation with `BrowserRouter.layer` in the browser, `Router.static` on the server and `Router.memory` in tests.
- **Services per Component:** `Component.provide` gives services to a Component and everything below it. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The browser loads the chunk the first time the Component renders, so it stays out of the initial bundle.
- **Control overlapping Commands:** When an update issues a Command that is still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.
- **Full-stack SSR and prerendering:** `HtmlServerVite.plugin` renders pages on the server in `vite dev`, prerenders static routes in `vite build` and can emit a production web handler. This page uses it.
- **Incremental adoption:** Mount any Component into an existing DOM node, publish it as a custom element with `BrowserHost.defineElement`, or consume third-party Web Components with `Html.customElement`.

## Try a snapshot build

Effect UI isn't on npm yet. Every commit to `main` is published as a snapshot build on [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). To install the latest one:

```sh
pnpm add effect \
  @effect/ui@https://pkg.pr.new/Effect-TS/ui/@effect/ui@main \
  @effect/ui-kit@https://pkg.pr.new/Effect-TS/ui/@effect/ui-kit@main
```

To stay on one build, replace `main` with a commit's short SHA. Snapshots of `@effect/ui-devtools`, `@effect/ui-opentui` and `@effect/ui-native` are published the same way, with install commands under [Snapshots](https://github.com/Effect-TS/ui#snapshots) in the README. You can ignore pnpm's unmet `@effect/ui` peer warning: the packages still use the snapshots you installed.

To start a new app from Vite's `vanilla-ts` template, follow [Start a new app](https://github.com/Effect-TS/ui#start-a-new-app). `@effect/ui` ships its guide as `node_modules/@effect/ui/AGENTS.md`, so point your coding agent's instructions at that file.

The [examples](https://github.com/Effect-TS/ui/tree/main/examples) in the repository are complete apps you can read and run, including [`domains`](https://github.com/Effect-TS/ui/tree/main/examples/domains) (a server-rendered domain search app with a shared `HttpApi`) and [`native`](https://github.com/Effect-TS/ui/tree/main/examples/native) (an Expo app running on `@effect/ui-native`).

## What happens next

- **Public preview:** Effect UI is still experimental, and we're sharing it early so you can try the APIs and help shape them. Open issues and PRs in [Effect-TS/ui](https://github.com/Effect-TS/ui).
- **Toward full-stack Effect:** We're building toward a full-stack Effect framework on the same zero-dependency core, where your database, HTTP and RPC APIs, auth, background work, observability and UI share one programming model. Server rendering and prerendering with a shared `HttpApi` already work today.
- **Moving into the Effect monorepo:** Effect UI lives in its own repository while the APIs settle. Once it's ready, we plan to move it into the main Effect monorepo and version and release it in lockstep with Effect.
- **Coming from Foldkit 0.x?** [Foldkit 0.x](https://foldkit.dev) will keep getting critical bug fixes until Effect UI ships with an upgrade guide, and the migration will be an upgrade, not a rewrite. Relevant issues and PRs will move to `Effect-TS/ui` ([read the announcement](https://foldkit.dev/blog/foldkit-joins-effect)).

:::Footer
We built this page with Effect UI. [Read the source](https://github.com/Effect-TS/ui/tree/main/examples/launch) in `examples/launch` in Effect-TS/ui.
:::
