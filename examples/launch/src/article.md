---
title: Foldkit 0.x becomes Effect UI
---

Effect UI continues the work of Foldkit 0.x, the frontend framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect). Feature work on Foldkit 0.x is paused and has moved to Effect UI.

If you've built an app on Foldkit 0.x, you can keep building with it for now. When Effect UI ships with an upgrade guide, you'll migrate your app rather than rewrite it.

Here is what changes in Effect UI:

- [The core change: Component-based architecture](#the-core-change-component-based-architecture)
- [Addition: Built-in queries](#addition-built-in-queries)
- [Change: Simpler Story and Scene tests](#change-simpler-story-and-scene-tests)
- [Addition: Play tests](#addition-play-tests)
- [Change: Improved performance](#change-improved-performance)

The values and guarantees from Foldkit 0.x carry over as well.

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues that work. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework built on Effect UI.

## The core change: Component-based architecture

Foldkit 0.x built an entire app as one Elm Architecture program before it started. Its code shipped in a single bundle, every Message passed through the root and an error that escaped any part could stop the whole app.

Effect UI breaks that single program into Components. Each Component is an Elm Architecture program of its own, with its own Model, Messages, init, update and view. You build an app by composing them.

Because a Component is self-contained, its parent doesn't store its state or forward its Messages. You can write, test and reuse it on its own. A Message goes straight to the update of the Component it belongs to, and that Component's view runs. Each Component can also bring its own services, load from its own chunk and fail without taking down the rest of the app.

### How Messages travel in Foldkit 0.x vs. Effect UI

Every Message in a Foldkit 0.x app started at the root update. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update. The returned state went back into the single application Model, and the view ran from the root.

Effect UI skips that round trip. The runtime delivers a Message straight to the Component's update, stores its new Model and runs its view. You keep explicit state transitions while dropping the parent-to-child forwarding code.

Try sending a Message from Root, its child A or A's children A1 and A2 to watch the path each architecture takes.

::Architecture

### Foldkit 0.x vs. Effect UI code comparison

Rendering a child Component in Effect UI takes one call in the parent's view. Foldkit 0.x needed `Page` to store the counter's Submodel and forward its Messages. That wiring is gone.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### A complete Component

Here is a complete Component running live next to its code. One definition holds its Model, Messages, init, update, subscriptions and view, plus a delayed reset Command and an auto-count Subscription.

:::Counter{code="intro" label="Live auto-counter"}
Click "Increment", then turn "Auto-count" on and off.
:::

### Organizing larger Components

As a Component grows, you can move init, update, subscriptions and view into their own functions. The Component definition's helpers supply their types, so you don't have to annotate them by hand.

:::Listing{code="split"}
The same counter with each function extracted.
:::

### State outside the Model

Foldkit 0.x put every piece of application state into one Model. Each Effect UI Component keeps its own Model, and the runtime tracks two other kinds of state beside it.

First, data fetched through a [query](#addition-built-in-queries) lives in the runtime's cache, where view reads it from `h.queries` and update reads it from `$.queries`. Second, the runtime tracks which Commands are in flight. The counter above checks `h.isRunning(DelayReset)` in its view, so its Model needs no boolean flag for a reset in progress.

When you provide a `MessageLog`, the runtime records both query results and running Commands alongside the Component's Messages.

## Addition: Built-in queries

Fetching server data in Foldkit 0.x meant storing it in the Model like local state. Every resource needed a Model field, a fetch Command, a result Message and update branches for loading, success and failure.

Foldkit 0.x's experimental `Query` packaged that boilerplate, but it was still a Submodel. Its parent still stored its Model, wrapped its Messages and decided when to load or refresh. As the Foldkit 0.x docs put it, Query did not "react to rendering, expire data after a duration, poll, or refresh related resources on its own".

Using the Model as a cache created two more headaches. Any two parts of the app that displayed the same data needed a shared ancestor to hold it. When a Command changed data on the server, the code that made the change had to refresh each affected Query by hand.

Effect UI moves queries into the runtime. You define a query once with its arguments, result, freshness duration and fetch function. A Component declares the queries and arguments it needs. The runtime fetches them on render, and the view reads the results.

:::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}
Both load the same list of posts and show it.
:::

One app-wide cache holds the results, keyed by query and arguments. Two Components asking for the same data share a single cache entry and a single request. The runtime refetches stale entries and drops unused ones.

Cache invalidation lives on the Command that changes the data. A `Command.Service` declares what it makes stale in its `invalidates` option: a whole query, a single entry or a shared tag. When that Command finishes, the runtime refetches whichever affected entries are currently on screen. Your Model holds user state and stops doubling as a copy of the server.

Moving server data into the cache keeps replay and testing intact. update reads query results only through `$.queries`, and a `MessageLog` records every result alongside the Messages, so replaying a Component's log still reproduces its Model. Story and Scene tests never hit the network; they supply a query result with a step like `loaded`, the same way they resolve a Command by hand.

## Change: Simpler Story and Scene tests

Story tests send Messages straight to update, and Scene tests drive update through the view. Foldkit 0.x required you to pass those functions along with a starting Model via `given`. Effect UI takes the Component itself and starts from the Model its init returns. When a test needs a different starting state, `given` overrides that Model.

::Compare{foldkit="storyFoldkit" foldkitTitle="Foldkit 0.x Story: update and a given Model" effect="storyEffect" effectTitle="Effect UI Story: the Component itself"}

::Compare{foldkit="sceneFoldkit" foldkitTitle="Foldkit 0.x Scene: update, view and a given Model" effect="sceneEffect" effectTitle="Effect UI Scene: the Component itself"}

## Addition: Play tests

Story and Scene tests verify your update and view in isolation by resolving each Command by hand, which means the Commands themselves never run. In Foldkit 0.x, testing a Command meant running its Effect separately against a mock Layer.

Play closes that gap. It mounts a Component with its children and runs their real Commands, Subscriptions and query fetches against the Layers you provide. One test can click a button, let the real Command execute, advance time and assert what appears on screen afterwards. None of it needs a browser or a DOM.

Because `TestClock` drives the clock, timing assertions stay deterministic down to the millisecond. In the delayed-reset Play test, the count is still 1 at 999 ms and drops to 0 at 1,000 ms.

::Listing{code="play"}

## Change: Improved performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## More changes

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from its own chunk with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, the routes of a single app couldn't be split.
- **Recover from Component failures:** Show a fallback when a Component fails while the rest of the app keeps running.
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

Effect UI doesn't cover everything Foldkit 0.x has yet. We're publishing it early so you can try the new APIs, explore the demos and inspector on this page and tell us what you think.

You don't need to move anything today. Foldkit 0.x will keep receiving critical bug fixes at least until Effect UI ships with an upgrade guide.

Development now happens in [Effect-TS/ui](https://github.com/Effect-TS/ui). Applicable Foldkit issues and pull requests will be transferred there, so you don't need to open them again.

:::Footer
This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.
:::
