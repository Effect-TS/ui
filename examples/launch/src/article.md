---
title: Foldkit 0.x becomes Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect). Feature work on Foldkit 0.x is paused and has moved to Effect UI.

If you've built an app with Foldkit 0.x, you can keep building with it for now. When Effect UI ships with an upgrade guide, you'll migrate your app rather than rewrite it.

This article covers what is changing in Effect UI:

- [The core change: Component-based architecture](#the-core-change-component-based-architecture)
- [Addition: Built-in queries](#addition-built-in-queries)
- [Change: Simpler Story and Scene tests](#change-simpler-story-and-scene-tests)
- [Addition: Play tests](#addition-play-tests)
- [Change: Improved performance](#change-improved-performance)

It also covers what will stay the same.

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues that work. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework built on Effect UI.

## The core change: Component-based architecture

Foldkit 0.x used the Elm Architecture. The architecture has many benefits, but it also has meaningful drawbacks in performance, code splitting and scalability.

Effect UI addresses them with Components. Each Component is an Elm Architecture program of its own, with a Model, Messages, init, update and view, and you build an app by composing Components.

A Foldkit 0.x app was composed as one program before it started. Its code shipped as one bundle, every Message passed through the root and an error that escaped any part could stop the whole app.

A Component is self-contained. Its parent doesn't store its state or forward its Messages, so you can write, test and reuse it on its own. A Message goes to the update of the Component it belongs to, and that Component's view runs. A Component can also bring its own services, load from a chunk of its own and fail while the rest of the app keeps running.

### How Messages travel in Foldkit 0.x vs. Effect UI

In Foldkit 0.x, the root update handled every Message. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update, which returned the next state. That state was put back into the single application Model, and the view ran from the root with the new Model.

In Effect UI, the runtime delivers a Message directly to the update of the Component it belongs to. It then stores that Component's new Model and runs its view. You keep the Elm Architecture's explicit state transitions, and you don't write the wiring that carries a Message through each parent.

The diagram below illustrates how each architecture handles a Message. Send one from Root, from its child A or from A's children A1 and A2.

::Architecture

### Foldkit 0.x vs. Effect UI code comparison

To render a child Component in Effect UI, a parent calls it in its view. The parent doesn't store the child's state or forward its Messages, as a Foldkit 0.x parent did for a Submodel.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### A complete Component

This counter is a complete Component. One definition holds its Model, Messages, init, update, subscriptions and view, with a delayed reset Command and an auto-count Subscription. It runs live next to its code.

:::Counter{code="intro" label="Live auto-counter"}
Click "Increment", then turn "Auto-count" on and off.
:::

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own to keep it readable. The Component definition's helpers supply their types, so you don't have to annotate them.

:::Listing{code="split"}
The same counter with each function extracted.
:::

### State outside the Model

In Foldkit 0.x, all of an app's state lived in its one Model. In Effect UI, each Component has a Model for its own state, and the runtime keeps two kinds of state beside it.

Data that a Component fetches with a [query](#addition-built-in-queries) lives in the runtime's cache. The view reads it from `h.queries` and update reads it from `$.queries`. The runtime also knows which Commands are running. The counter's view asks with `h.isRunning(DelayReset)`, so its Model has no flag for a reset in progress.

When you provide a `MessageLog`, the runtime records both alongside the Component's Messages.

## Addition: Built-in queries

In Foldkit 0.x, fetched data lived in the Model like any other state. Each resource needed a field in the Model, a Command to fetch it, a Message for the result and update branches for loading, success and failure.

Foldkit 0.x's experimental `Query` packaged that loop, but it was still a Submodel: the parent stored its Model, wrapped its Messages and decided when to load or refresh. As the Foldkit 0.x docs put it, Query did not "react to rendering, expire data after a duration, poll, or refresh related resources on its own".

Because the Model was also the cache, two parts of the app that showed the same data needed a shared ancestor to hold it. When a Command changed data on the server, the code that made the change had to refresh each affected Query by hand.

In Effect UI, you define a query once: its arguments, its result, how long the result stays fresh and how to fetch it. A Component lists the queries it needs and their arguments. The runtime fetches the data when the Component is rendered and the view reads the results.

:::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}
Both load the same list of posts and show it.
:::

The runtime keeps one cache for the app, keyed by query and arguments. Components that ask for the same data share one cache entry and one request. The runtime refetches stale entries and drops unused ones.

A Command defined with `Command.Service` lists the queries it makes out of date in its `invalidates` option. Each target is a whole query, one entry of a query or a tag that several queries share. When the Command ends, the runtime refetches the affected entries that a Component is showing. The Model holds what the user did, without keeping a copy of fetched data.

Queries don't change what you can reconstruct or test. update reads query results only through `$.queries`, and a `MessageLog` records every query result next to the Messages, so replaying a Component's log reproduces its Model. In Story and Scene tests, nothing is fetched. The test sets a query's result with a step such as `loaded`, the same way it resolves a Command by hand.

## Change: Simpler Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, replace that Model with `given`.

::Compare{foldkit="storyFoldkit" foldkitTitle="Foldkit 0.x Story: update and a given Model" effect="storyEffect" effectTitle="Effect UI Story: the Component itself"}

::Compare{foldkit="sceneFoldkit" foldkitTitle="Foldkit 0.x Scene: update, view and a given Model" effect="sceneEffect" effectTitle="Effect UI Scene: the Component itself"}

## Addition: Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component with its children and runs their Commands, Subscriptions and query fetches for real, against the Layers the test provides.

One test can now cover a whole flow. It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM. In Foldkit 0.x, you tested a Command's Effect on its own with a mock Layer.

`TestClock` controls time, so the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::Listing{code="play"}

## Change: Improved performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## More changes

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, the routes of a single app couldn't be split.
- **Recover from Component failures:** Show a fallback for a Component that fails while the rest of the app keeps running.
- **Keep state while hidden:** Mark a Component `scoped` to keep its Model while it's hidden. Otherwise the Model is discarded when the Component stops being rendered.
- **Control overlapping Commands:** When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.
- **Commands without result Messages:** Use `Command.asNoop` to run a Command when update doesn't need its result.
- **Custom markup for headless Components:** A headless Component such as the UI kit's Dialog manages state and behavior and hands your view its parts. You apply each part to an element you write, as in `dialog.title(h.h2)`, so the markup and styling stay yours. Foldkit UI passed your `toView` callback bundles of attributes to spread onto your elements.

## What isn't changing: core values, features and guarantees

What people value in Foldkit 0.x carries over to Effect UI.

- **The same structure everywhere:** Every Component has a Model, Messages, init, update and view, so you, a new teammate or an AI agent always know where to look.
- **Explicit state transitions:** A Component's Model changes only in its update, in response to a Message.
- **Side effects as values:** Commands, Subscriptions and Mounts describe work for the runtime to run. update and view never perform it themselves.
- **Tests without a browser:** update is still a pure function, so a Story test needs no DOM and no mocks.
- **A record of what happened:** With a `MessageLog`, the runtime records every Message and query result in order, and a Component's state can be reproduced from its log. The inspector in the corner of this article reads that log.

## You can keep building on Foldkit 0.x

Effect UI doesn't have everything Foldkit 0.x has yet. We're publishing it now so you can try it, get a feel for the new APIs and tell us what you think.

You can keep building with Foldkit 0.x, and it will receive critical bug fixes at least until Effect UI ships with an upgrade guide.

Effect UI is developed in [Effect-TS/ui](https://github.com/Effect-TS/ui). Applicable Foldkit issues and pull requests will be transferred there, so you don't need to open them again.

:::Footer
This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.
:::
