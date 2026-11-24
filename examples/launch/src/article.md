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

Foldkit 0.x used the Elm Architecture. This architecture has many benefits, but meaningful drawbacks including performance challenges, issues with code splitting and scalability concerns.

Effect UI addresses these issues. In Effect UI, an app is built from Components. Each Component is an Elm Architecture program with a Model, Messages, init, update and view. You build your application by composing Components.

### How Messages travel in Foldkit 0.x vs. Effect UI

In Foldkit 0.x, every Message was handled by the root update function. If the application was decomposed into Submodels, the root update delegated to the relevant Submodel update function(s) to transition to the next state. The new state was slotted into the single application Model, and then the view function ran from the root with that new Model.

In Effect UI, a Message for a Component is delivered directly to that Component's update function. The runtime then stores that Component's new Model, and its view runs. This gives you the benefits of the explicit state transitions of the Elm Architecture, without asking you to handle Message wiring.

The diagram below illustrates how a Message is handled in each architecture.

::Architecture

In Foldkit 0.x, you compose an app from Submodels. Each parent stores its children's state and forwards their Messages, so every Message passes through the root update. In Effect UI, the runtime keeps each Component's Model and delivers a Message to the update of the Component that sent it.

### Foldkit 0.x vs. Effect UI code comparison

In Effect UI, to render a child Component, a parent just calls it in its view. The parent doesn't store the child's state or forward its Messages.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### Components are self-contained

A Foldkit 0.x app is composed as one program before it starts, so its code ships as one bundle and an error that escapes any part can stop the whole app.

An Effect UI Component is self-contained. You can write, test and reuse it on its own or remove it without changing how its parent manages state or handles Messages. It can also bring its own services, load its code on demand and fail without stopping the rest of the app.

Here is a counter with a delayed reset Command and an auto-count Subscription.

:::Counter{code="intro" label="Live auto-counter"}
Click "Increment", then turn "Auto-count" on and off.
:::

### Organizing larger Components

You can still extract init, update, subscriptions and view. This can help keep things readable as your Component grows.

The Component definition's helpers supply the types, so you don't have to annotate the extracted functions.

:::Listing{code="split"}
The same counter with each function extracted.
:::

## Addition: Built-in queries

In Foldkit 0.x, fetched data lives in the Model like any other state. Each resource needs a field in the Model, a Command to fetch it, a Message for the result and update branches for loading, success and failure. Foldkit 0.x's experimental `Query` packages that loop, but it's still a Submodel: the parent stores its Model, wraps its Messages and decides when to load or refresh. As the Foldkit 0.x docs put it, Query does not "react to rendering, expire data after a duration, poll, or refresh related resources on its own".

Because the Model is also the cache, two parts of the app that show the same data need a shared ancestor to hold it. When a Command changes data on the server, the code that made the change has to refresh each affected Query by hand.

In Effect UI, you define a query once: its arguments, its result, how long the result stays fresh and how to fetch it. A Component lists the queries it needs and their arguments. The runtime fetches the data when the Component is rendered and the view reads the results.

:::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}
Both load the same list of posts and show it.
:::

The runtime keeps one cache for the app, keyed by query and arguments. Components that ask for the same data share one cache entry and one request. The runtime refetches stale entries and drops unused ones. A Command declares which query results it makes out of date. When the Command ends, the runtime refetches the ones a Component is showing. The Model holds what the user did, without keeping a copy of fetched data.

## Change: Simpler Story and Scene tests

Story tests update and Scene tests update through the view. In Foldkit 0.x, you pass the functions under test and a starting Model. In Effect UI, you pass the Component, so there is no starting state to supply separately.

::Compare{foldkit="storyFoldkit" foldkitTitle="Foldkit 0.x Story: update and a given Model" effect="storyEffect" effectTitle="Effect UI Story: the Component itself"}

::Compare{foldkit="sceneFoldkit" foldkitTitle="Foldkit 0.x Scene: update, view and a given Model" effect="sceneEffect" effectTitle="Effect UI Scene: the Component itself"}

## Addition: Play tests

Play mounts the Component, lets you click its buttons and runs the real Commands and Subscriptions.

Story and Scene tests let you expect a Command and resolve it by hand. That's useful for testing what update does with the result, but the Command itself never runs. In Foldkit 0.x, you test the Command's Effect separately with a mock Layer.

With `TestClock`, the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::Listing{code="play"}

## Change: Improved performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spends less time running JavaScript overall than Foldkit 0.x, paints sooner and uses less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## More changes

- **Services per Component:** Provide the services a Component's Commands need with `Component.provide`. TypeScript reports a missing service at compile time.
- **Load Components on demand:** Load a Component's code the first time it's rendered so it stays out of the initial bundle.
- **Recover from Component failures:** Show a fallback for a Component that fails while the rest of the app keeps running.
- **Keep state while hidden:** Mark a Component `scoped` to keep its Model while it's hidden. Otherwise the Model is discarded when the Component stops being rendered.
- **Control overlapping Commands:** When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.
- **Commands without result Messages:** Use `Command.asNoop` to run a Command when update doesn't need its result.
- **Custom markup for headless Components:** Supply your own markup while the Component manages its state and behavior.
- **Reusable view fragments:** Use a typed view function for a piece of the view that needs no Model of its own.

## Unchanged: Values, features and guarantees

The Model is still the source of truth for state, Messages are facts about what happened and every change to a Model goes through update. Side effects happen at explicit boundaries, never inside update or view.

Commands, Subscriptions and Mounts are still values the runtime runs. A child can still tell its parent what happened without holding a reference to it: where a Foldkit 0.x Submodel returns an OutMessage, an Effect UI Component emits a typed event with `$.emit`.

Foldkit 0.x DevTools can show every Message because each one goes through the root update. Effect UI keeps that record per Component. When you provide a `MessageLog`, the runtime records every Message a Component handles, in order, along with each query result. Replaying the Component's log reproduces its state.

## You can keep building on Foldkit 0.x

Effect UI doesn't have everything Foldkit 0.x has. DevTools, state-preserving live reload and the crash view, for example, are not in Effect UI today. You can keep building with Foldkit 0.x, and it will receive critical bug fixes at least until Effect UI ships with an upgrade guide.

Effect UI is developed in [Effect-TS/ui](https://github.com/Effect-TS/ui). Existing Foldkit issues and pull requests will be transferred there, so you don't need to open them again. If your app relies on something this article doesn't cover, open an issue there and tell us.

:::Footer
This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.
:::
