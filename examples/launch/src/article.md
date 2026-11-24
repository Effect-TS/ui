---
title: Introducing Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect).

If you're building with Foldkit 0.x today, we encourage you to continue. The migration to Effect UI will be an upgrade, not a rewrite. Feature work on Foldkit 0.x has moved to Effect UI.

::AgentPrompt{title="TL;DR agent prompt" prompt="Read $URL and explain what Effect UI is, how it continues Foldkit 0.x and what the key changes are."}

This article isn't a complete list of what changes from Foldkit 0.x to Effect UI. It covers key changes in these areas:

- [Components](#components)
- [State and data](#state-and-data)
- [Views and rendering](#views-and-rendering)
- [Testing](#testing)
- [Performance](#performance)

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues that work. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework built on Effect UI.

## Components

Foldkit 0.x used the Elm Architecture. The architecture has many benefits, but it also has meaningful drawbacks in performance, code splitting and scalability.

Effect UI addresses these drawbacks with Components. Each Component is an Elm Architecture program of its own, and you build an app by composing Components.

A Component is self-contained. Its parent doesn't store its state or forward its Messages, so you can write, test and reuse it on its own. A Component can also bring its own services, load from a chunk of its own and fail while the rest of the app keeps running.

### A complete Component

This counter is a complete Component. One definition holds its Model, Messages, init, update, subscriptions and view, with a delayed reset Command and an auto-count Subscription.

:::Counter{code="intro" label="Live auto-counter"}
Click "Increment", then turn "Auto-count" on and off.
:::

### How Messages travel in Foldkit 0.x vs. Effect UI

In Foldkit 0.x, the root update handled every Message. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update, which returned the next state. That state was put back into the single application Model, and the view ran from the root with the new Model.

In Effect UI, the runtime delivers a Message directly to the update of the Component it belongs to. It then stores that Component's new Model and runs its view. You keep the Elm Architecture's explicit state transitions, and you don't write the wiring that carries a Message through each parent.

The diagram below illustrates how each architecture handles a Message.

::Diagram{scenario="messages"}

### Foldkit 0.x vs. Effect UI code comparison

To render a child Component, the parent calls it in its view and passes props. The child declares its props with a Schema and reads them in init, update and view.

When the parent passes different props, the child's view runs again. When the props are the same, the child's view doesn't run, even though its parent's did.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own to keep it readable. The Component definition's helpers supply their types, so you don't have to annotate them.

:::Listing{code="split"}
The auto-counter from [A complete Component](#a-complete-component) with each function extracted.
:::

## State and data

### Shared state with Providers

In Foldkit 0.x, state that several Submodels needed lived in the Model of a parent they shared. Each level passed it down, and a Submodel communicated back up the tree with an OutMessage, which each parent forwarded until it reached the owner.

A Provider shares part of its Model with Components inside it, at any depth. In this example, CartProvider holds the cart count. CartCount reads that count, and AddToCart sends CartProvider a Message to change it. Product sits between CartProvider and AddToCart but passes no cart value or Message. Only CartProvider's update changes the count.

:::Listing{code="provider"}
A Provider that shares a cart's count, and the Components inside it that read and change it. `Product` sits in between and doesn't mention the cart.
:::

::Diagram{scenario="sharedState"}

### Built-in queries

In Foldkit 0.x, fetched data lived in the Model. The experimental `Query` handled loading, success and failure, but it was a Submodel: the parent stored it, forwarded its Messages and decided when to load or refresh.

In Effect UI, you define a query once, and a Component lists the queries it needs. The runtime does the rest:

- **Fetching:** It fetches when the Component is rendered and again when the query's arguments change. The `debounce` option waits until they stop changing.
- **Caching:** Results live in the runtime's cache, not in a Model, so Components that list the same query share one fetch.
- **Freshness:** `staleTime` sets how long a result counts as fresh. A stale result stays on screen while the runtime refetches it.
- **States:** The view reads each result as an `AsyncResult`: no result yet, failure or success.

:::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}
Both search the same posts as you type, 300 ms after the last keystroke. In Foldkit 0.x, the wait was a version counter in the Model and a `DelaySearch` Command. In Effect UI, it is the `debounce` option, and only this version refetches a result older than a minute.
:::

### Where state lives

In Foldkit 0.x, all of an app's state lived in its one Model. In Effect UI, each Component has its own Model, and a Component can read state that is owned elsewhere:

- **Its own Model:** State the Component changes in its update, such as a form draft or whether a dialog is open.
- **Another Component's Model:** A parent passes state down as props, and a [Provider](#shared-state-with-providers) shares state with every Component inside it.
- **The query cache:** The runtime keeps the data a [query](#built-in-queries) fetches, with its loading and failure states.

The runtime also tracks which Commands are running, and a view can check with `h.isRunning`. The auto-counter in [A complete Component](#a-complete-component) shows "Resetting" this way, so its Model needs no flag for a reset in progress.

A Component's Model holds the state it changes through update. It no longer has to hold everything its view shows.

With logging enabled, you can still replay a Component's recorded Model without rerunning side effects. The log includes the Messages and the values update read from props, queries and Providers.

## Views and rendering

### Parts for headless Components

The components in Foldkit UI were headless: each one managed behavior, keyboard handling and ARIA, and you wrote the markup. Your `toView` callback received bundles of attributes, and you spread each bundle onto the element it belonged to.

In Effect UI, a headless Component gives your view parts instead. You apply each part to an element you write, as in `collapsible.trigger(h.button)`, then add your own classes and children.

::Compare{foldkit="partsFoldkit" foldkitTitle="Foldkit 0.x: spread the attribute bundles from toView" effect="partsEffect" effectTitle="Effect UI: apply each part to an element"}

A headless Component defines `parts` instead of a view. It has its own Model, Messages and update, so it can keep state that in Foldkit 0.x lived in the parent's Model.

:::Listing{code="partsOwn"}
A headless Disclosure that keeps its own open state and a Component that draws it.
:::

### Host-agnostic rendering

In Foldkit 0.x, the runtime rendered a view by patching the browser DOM directly.

Effect UI renders through a host rather than updating the DOM directly. The browser host creates DOM nodes; the test host creates plain objects. Both can run the same Components.

You choose the host when mounting the app. The entry point below uses `BrowserHost.mount`. The host interface is public, so you can also implement your own.

:::Listing{code="mount"}
This article's entry point. `BrowserHost.mount` selects the browser host.
:::

## Testing

### Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, you may replace that Model with `given`.

::Compare{foldkit="storyFoldkit" foldkitTitle="Foldkit 0.x Story: update and a given Model" effect="storyEffect" effectTitle="Effect UI Story: the Component itself"}

::Compare{foldkit="sceneFoldkit" foldkitTitle="Foldkit 0.x Scene: update, view and a given Model" effect="sceneEffect" effectTitle="Effect UI Scene: the Component itself"}

### Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component with its children on the [test host](#host-agnostic-rendering) and runs their Commands, Subscriptions and query fetches for real, against the Layers the test provides.

One test can now cover a whole flow. It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM.

`TestClock` controls time, so the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::PlayTest

## Performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## More changes

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, the routes of a single app couldn't be split.
- **Recover from Component failures:** Show a fallback for a Component that fails while the rest of the app keeps running.
- **Keep state while hidden:** Write a child inside `h.keepAlive` and call it with the `s` it passes, and it keeps its Model while no view renders it. Otherwise the Model is discarded when the Component stops being rendered.
- **Control overlapping Commands:** When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.
- **Commands without result Messages:** Use `Command.asNoop` to run a Command when update doesn't need its result.

## What isn't changing: core values, features and guarantees

What people value in Foldkit 0.x carries over to Effect UI.

- **The same structure everywhere:** Every Component has a Model, Messages, init and update, with a view or, for a headless Component, parts. You, a new teammate or an AI agent always know where to look.
- **Explicit state transitions:** Once a Component is running, its Model changes only in its update, in response to a Message.
- **Side effects as values:** Commands, Subscriptions and Mounts describe work for the runtime to run. update and view don't perform it themselves.
- **Tests that declare what happened:** Tests read as steps you can follow. Story and Scene let you supply Command results, and fail if a Command is left unresolved; Play runs the work against the Layers you provide.
- **A record of what happened:** Enable message logging to record Messages, Model changes and query results. You can inspect that history and replay a Component's recorded state without rerunning side effects. The inspector in the corner of this article lists that history, and its time travel shows the article as it was at an earlier entry.

## You can keep building on Foldkit 0.x

Effect UI doesn't have everything Foldkit 0.x has yet. We're making it public now so you can try it, get a feel for the new APIs and tell us what you think.

You can keep building with Foldkit 0.x, and it will receive critical bug fixes at least until Effect UI ships with an upgrade guide.

Effect UI is developed in [Effect-TS/ui](https://github.com/Effect-TS/ui). Applicable Foldkit issues and pull requests will be transferred there, so you don't need to open them again.

Thanks for building with Effect UI! :)

## Try a snapshot build

Effect UI isn't on npm yet. Every commit to `main` is published as a snapshot build on [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). To install the latest one:

```sh
pnpm add effect \
  https://pkg.pr.new/Effect-TS/ui/@effect/ui@main \
  https://pkg.pr.new/Effect-TS/ui/@effect/ui-kit@main
```

The second URL adds the UI kit, which is optional. To stay on one build, replace `main` with a commit's short SHA.

The [examples](https://github.com/Effect-TS/ui/tree/main/examples) in the repository are complete apps you can read and run.

:::Footer
This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.
:::
