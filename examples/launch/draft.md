# How Foldkit 0.x evolves into Effect UI

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect). Feature work on Foldkit 0.x is paused and has moved to Effect UI.

If you've built an app with Foldkit 0.x, you can keep building with it for now. When Effect UI ships with an upgrade guide, you'll migrate your app rather than rewrite it. The Elm Architecture you know still applies.

This article covers what is different in Effect UI:

- [The core change: Component-based architecture](#architecture)
- [Addition: Built-in queries](#queries)
- [Change: Simpler Story and Scene tests, plus Play](#testing)
- [Change: Improved performance](#performance)

It also covers what stays the same.

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues that work. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework built on Effect UI.

## The core change: Component-based architecture

An Effect UI app is built from Components. A Component is a small Elm Architecture program with a Model, Messages, init, update and view. In Foldkit 0.x, the whole app shares one Model and one root update. In Effect UI, each Component has its own.

### How Messages travel

The diagram below compares how a Message is handled in each architecture.

_Figure: an interactive diagram. Send a Message from A1, A2, B1 or B2 to play the steps, or select a step. The steps for A1:_

**Foldkit 0.x: One Model, held at the root**

1. A1's view sends a Message.
2. A wraps it in a Message of its own.
3. Root wraps it again, and the root update receives it.
4. Root's update passes it to A's update.
5. A's update passes it to A1's update, which returns a new value.
6. A puts that value in its part of the Model.
7. Root puts A's part in the application Model.
8. The view runs from the root with the new Model.

**Effect UI: One Model per Component**

1. A1's view sends a Message.
2. The runtime delivers it to A1's update.
3. The runtime stores A1's new Model, and A1's view runs.

In Foldkit 0.x, you compose an app from Submodels. Each parent stores its children's state and forwards their Messages, so every Message passes through the root update. In Effect UI, the runtime keeps each Component's Model and delivers a Message to the update of the Component that sent it.

### The code you write

To render a child Component, a parent calls it in its view. The parent doesn't store the child's state or forward its Messages.

_Figure: Foldkit 0.x: Page stores and forwards for Counter / Effect UI: Page renders Counter. Code: Counter.ts, Page.ts, Counter.ts, Page.ts._

A Foldkit 0.x app is composed as one program before it starts, so its code ships as one bundle and an error that escapes any part can stop the whole app. An Effect UI Component is self-contained. You can write, test and reuse it on its own or remove it without changing how its parent manages state or handles Messages. It can also bring its own services, load its code on demand and fail without stopping the rest of the app.

Here is a counter with a delayed reset Command and an auto-count Subscription.

_Figure: Code: Counter.ts. Includes a live example. Caption: Click "Increment", then turn "Auto-count" on and off._

### Organizing larger Components

The counter above defines init, update, subscriptions and view inline in one call. As a Component grows, that call gets harder to follow. Extracting them into named functions keeps each one readable, and they can move into their own files.

_Figure: Code: Counter.ts. Caption: The same counter with each function extracted._

The Component definition's helpers supply the types, so you don't have to annotate the extracted functions.

## Addition: Built-in queries

In Foldkit 0.x, fetched data lives in the Model like any other state. Each resource needs a field in the Model, a Command to fetch it, a Message for the result and update branches for loading, success and failure. Foldkit 0.x's experimental `Query` packages that loop, but it's still a Submodel: the parent stores its Model, wraps its Messages and decides when to load or refresh. As the Foldkit 0.x docs put it, Query does not "react to rendering, expire data after a duration, poll, or refresh related resources on its own".

Because the Model is also the cache, two parts of the app that show the same data need a shared ancestor to hold it. When a Command changes data on the server, the code that made the change has to refresh each affected Query by hand.

In Effect UI, you define a query once: its arguments, its result, how long the result stays fresh and how to fetch it. A Component lists the queries it needs and their arguments. The runtime fetches the data when the Component is rendered and the view reads the results.

_Figure: Foldkit 0.x: the parent stores and drives the Query / Effect UI: the Component lists its query. Code: posts.ts, Posts.ts. Caption: Both load the same list of posts and show it._

The runtime keeps one cache for the app, keyed by query and arguments. Components that ask for the same data share one cache entry and one request. The runtime refetches stale entries and drops unused ones. A Command declares which query results it makes out of date. When the Command ends, the runtime refetches the ones a Component is showing. The Model holds what the user did, without keeping a copy of fetched data.

## Change: Simpler Story and Scene tests, plus Play

Effect UI changes testing in two ways. Story and Scene tests take the Component and start from its init. A third kind of test, Play, runs a Component's real Commands and Subscriptions.

Story tests update and Scene tests update through the view. In Foldkit 0.x, you pass the functions under test and a starting Model. In Effect UI, you pass the Component, so there is no starting state to supply separately.

_Figure: Foldkit 0.x Story: update and a given Model / Effect UI Story: the Component itself. Code: counter.story.test.ts, Counter.story.test.ts._

_Figure: Foldkit 0.x Scene: update, view and a given Model / Effect UI Scene: the Component itself. Code: counter.scene.test.ts, Counter.scene.test.ts._

Both kinds of test let you expect a Command and resolve it by hand. That's useful for testing what update does with the result, but the Command itself never runs. In Foldkit 0.x, you test the Command's Effect separately with a mock Layer.

Play mounts the Component, lets you click its buttons and runs the real Commands and Subscriptions. With `TestClock`, the delayed-reset test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

_Figure: Code: Counter.play.test.ts._

## Change: Improved performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spends less time running JavaScript overall than Foldkit 0.x, paints sooner and uses less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

_Figure: bar chart._

- Vanilla JS 1.00×
- Solid 1.92×
- Svelte 2.46×
- Vue 3.74×
- Effect UI 4.79×
- Foldkit 0.x 6.55×
- React 6.57×

_Time spent running JavaScript across the nine operations, as a multiple of vanilla JS (geometric mean). Shorter is faster. Read the [methodology](https://github.com/Effect-TS/ui/blob/b3995f2a9683e557f3c9dae3de2d006a19bc5268/packages/ui/benchmark/js-framework-benchmark/README.md) or the [raw results](https://github.com/Effect-TS/ui/tree/b3995f2a9683e557f3c9dae3de2d006a19bc5268/packages/ui/benchmark/js-framework-benchmark/results)._

_Details: Results for all seven frameworks, where lower is better_

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

This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.
