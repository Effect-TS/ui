---
title: Foldkit 0.x is becoming Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect).

If you're building with Foldkit 0.x today, we encourage you to continue. The migration to Effect UI will be an upgrade, not a rewrite. Feature work on Foldkit 0.x has moved to Effect UI.

::AgentPrompt{title="TL;DR agent prompt" prompt="Read $URL and explain how Foldkit 0.x is evolving into Effect UI and what the key changes and additions are."}

This article covers a selection of the key changes and additions in Effect UI. It isn't a complete list.

Key changes:

- [Component-based architecture](#the-core-change-component-based-architecture)
- [Improved performance](#change-improved-performance)
- [Simpler Story and Scene tests](#change-simpler-story-and-scene-tests)
- [Where state lives](#change-where-state-lives)
- [Parts for headless Components](#change-parts-for-headless-components)

Key additions:

- [Built-in queries](#addition-built-in-queries)
- [Shared state with Providers](#addition-shared-state-with-providers)
- [Play tests](#addition-play-tests)
- [Host-agnostic rendering](#addition-host-agnostic-rendering)

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues that work. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework built on Effect UI.

## The core change: Component-based architecture

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

Much simpler!

### Foldkit 0.x vs. Effect UI code comparison

To render a child Component in Effect UI, a parent calls it in its view. The parent doesn't store the child's state or forward its Messages, as a Foldkit 0.x parent did for a Submodel.

What the parent does pass is props. A Component declares its props with a Schema, and the parent passes them when it calls the child. The child reads them in init, update and view, and when the parent passes different props, the child's view runs again.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own to keep it readable. The Component definition's helpers supply their types, so you don't have to annotate them.

:::Listing{code="split"}
The auto-counter from [A complete Component](#a-complete-component) with each function extracted.
:::

## Change: Improved performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## Change: Simpler Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, you may replace that Model with `given`.

::Compare{foldkit="storyFoldkit" foldkitTitle="Foldkit 0.x Story: update and a given Model" effect="storyEffect" effectTitle="Effect UI Story: the Component itself"}

::Compare{foldkit="sceneFoldkit" foldkitTitle="Foldkit 0.x Scene: update, view and a given Model" effect="sceneEffect" effectTitle="Effect UI Scene: the Component itself"}

## Change: Where state lives

In Foldkit 0.x, all of an app's state lived in its one Model. In Effect UI, each Component has its own Model, and a Component can read state that is owned elsewhere:

- **Its own Model:** State the Component changes in its update, such as a form draft or whether a dialog is open.
- **Another Component's Model:** A parent passes state down as props, and a [Provider](#addition-shared-state-with-providers) shares state with every Component inside it.
- **The query cache:** The runtime keeps the data a [query](#addition-built-in-queries) fetches, with its loading and failure states.

The runtime also tracks which Commands are running, and a view can check with `h.isRunning`. The auto-counter in [A complete Component](#a-complete-component) shows "Resetting" this way, so its Model needs no flag for a reset in progress.

A Component's Model holds the state it changes through update. It no longer has to hold everything its view shows.

You can still reconstruct a Component's Model from a log of its Messages. When you enable logging for your app, the runtime records each Message in order, along with the props, query results and Provider values its update read. It also records changes to props and query results, and when Commands start and end. Replaying the log reproduces the Model without running Commands, fetches or Subscriptions.

## Change: Parts for headless Components

The components in Foldkit UI were headless: each one managed behavior, keyboard handling and ARIA, and you wrote the markup. Your `toView` callback received bundles of attributes, and you spread each bundle onto the element it belonged to.

In Effect UI, a headless Component gives your view parts instead. You apply each part to an element you write, as in `collapsible.trigger(h.button)`, then add your own classes and children.

::Compare{foldkit="partsFoldkit" foldkitTitle="Foldkit 0.x: spread the attribute bundles from toView" effect="partsEffect" effectTitle="Effect UI: apply each part to an element"}

A headless Component defines `parts` instead of a view. It has its own Model, Messages and update, so it can keep state that in Foldkit 0.x lived in the parent's Model.

:::Listing{code="partsOwn"}
A headless Disclosure that keeps its own open state and a Component that draws it.
:::

## Addition: Built-in queries

In Foldkit 0.x, fetched data lived in the Model like any other state. Each resource needed a field in the Model, a Command to fetch it, a Message for the result and update branches for loading, success and failure.

Foldkit 0.x's experimental `Query` packaged that loop, but it was still a Submodel: the parent stored its Model, wrapped its Messages and decided when to load or refresh. As the Foldkit 0.x docs put it, Query did not "react to rendering, expire data after a duration, poll, or refresh related resources on its own".

Because the Model was also the cache, two parts of the app that showed the same data needed a shared ancestor to hold it. When a Command changed data on the server, the code that made the change had to refresh each affected Query by hand.

In Effect UI, you define a query once: its arguments, its result, how long the result stays fresh and how to fetch it. A Component lists the queries it needs and their arguments. The runtime fetches the data when the Component is rendered and the view reads the results.

:::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}
Both load the same list of posts and show it.
:::

## Addition: Shared state with Providers

In Foldkit 0.x, state that several Submodels needed lived in the Model of a parent they shared. Each level passed it down, and a Submodel communicated back up the tree with an OutMessage, which each parent forwarded until it reached the owner.

In Effect UI, a Provider is a Component that shares part of its Model with every Component rendered inside it, at any depth. A Component lists the Provider to read its value and sends it a Message to ask for a change. The Components in between don't pass the value down or forward the Message. The value changes only in the Provider's update.

:::Listing{code="provider"}
A Provider that shares a cart's count, and the Components inside it that read and change it. `Product` sits in between and doesn't mention the cart.
:::

::Diagram{scenario="sharedState"}

## Addition: Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component with its children and runs their Commands, Subscriptions and query fetches for real, against the Layers the test provides.

One test can now cover a whole flow. It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM.

`TestClock` controls time, so the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::Listing{code="play"}

## Addition: Host-agnostic rendering

In Foldkit 0.x, the runtime rendered a view by patching the browser DOM directly.

In Effect UI, the core in `effect/ui` doesn't refer to HTML or the DOM. The runtime renders through a host that creates and updates nodes. A Layer provides the host, so you choose it where you mount the app. HTML elements and the browser host are in `effect/ui/html`, which is where the `Html` in a Component's `elements: Html` comes from.

Play tests use a second host. They mount the same Components on a test host that builds plain objects, so the tests run without a browser or DOM. The host interface is public, so you can write your own host.

:::Listing{code="mount"}
This article's entry point. `BrowserHost.mount` selects the browser host.
:::

## More changes

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, the routes of a single app couldn't be split.
- **Recover from Component failures:** Show a fallback for a Component that fails while the rest of the app keeps running.
- **Keep state while hidden:** Set `keepAlive: true` on a Component to keep its Model while it's hidden. Otherwise the Model is discarded when the Component stops being rendered.
- **Control overlapping Commands:** When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.
- **Commands without result Messages:** Use `Command.asNoop` to run a Command when update doesn't need its result.

## What isn't changing: core values, features and guarantees

What people value in Foldkit 0.x carries over to Effect UI.

- **The same structure everywhere:** Every Component has a Model, Messages, init and update, with a view or, for a headless Component, parts. You, a new teammate or an AI agent always know where to look.
- **Explicit state transitions:** Once a Component is running, its Model changes only in its update, in response to a Message.
- **Side effects as values:** Commands, Subscriptions and Mounts describe work for the runtime to run. update and view don't perform it themselves.
- **Tests that declare what happened:** A Story or Scene test reads as a list of steps: a Message or a click, the Command that update returned and the result you give that Command. Because you supply the result, there is nothing to mock and no waiting for the UI to settle. A test that leaves a Command unresolved fails. Play tests use Scene's steps and run the Commands for real.
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
