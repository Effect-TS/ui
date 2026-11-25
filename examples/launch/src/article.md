---
title: Introducing Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect).

Effect UI is in public preview: it isn't on npm yet and doesn't have everything Foldkit 0.x has. If you're building with Foldkit 0.x today, we encourage you to continue. The migration to Effect UI will be an upgrade, not a rewrite. Feature work on Foldkit 0.x has moved to Effect UI.

This page is built with Effect UI. You can [read its source](https://github.com/Effect-TS/ui/tree/main/examples/launch) on GitHub.

## Explore with an AI agent

:::PageOnly
Copy a prompt to explore this article with an AI agent. The first asks for a short summary. The second asks an agent that can see your Foldkit 0.x project to identify where Effect UI would simplify it most and to sketch one of those places as a Component.
:::

::AgentPrompt{title="TL;DR agent prompt" prompt="Read $URL. In under 200 words, say what Effect UI is and how it relates to Foldkit 0.x. Then list the main changes for someone with a Foldkit 0.x app, one line each, followed by what stays the same. Use only what the page says, and say so when it doesn't cover something."}

::AgentPrompt{title="Agent prompt for your Foldkit 0.x app" prompt="Read $URL. Then look at this Foldkit 0.x project and find the three places where Effect UI would simplify the code most. For each, name the files and say what would go away. Then sketch the smallest one as an Effect UI Component, using only APIs the page shows. Don't edit any files: Effect UI is in public preview and has no upgrade guide yet."}

## What this article covers

This article isn't a complete list of what changes from Foldkit 0.x to Effect UI. It covers key changes in these areas:

- [Components](#components)
- [State and data](#state-and-data)
- [Views and rendering](#views-and-rendering)
- [Testing](#testing)
- [DevTools](#devtools)
- [Performance](#performance)

## Terms

- **Foldkit 0.x:** The existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI:** The new frontend library that continues the work of Foldkit 0.x. You import it from `effect/ui`.
- **Foldkit:** The future full-stack framework. Effect UI will be its frontend.

## Components

Foldkit 0.x used the Elm Architecture. The architecture has many benefits, but it also has meaningful drawbacks in performance, code splitting and scalability.

Effect UI addresses these drawbacks with Components. Each Component is an Elm Architecture program of its own, and you build an app by composing Components.

A Component is self-contained. Its parent doesn't store its state or forward its Messages, so you can write, test and reuse it on its own. A Component can also bring its own services, load from a chunk of its own and fail while the rest of the app keeps running.

### A complete Component

This counter is a complete Component. One definition holds its Model, Messages, init, update, subscriptions and view, with a delayed reset Command and an auto-count Subscription.

::Counter{code="intro" label="Live auto-counter"}

Click "+1", then click the Effect UI button in the bottom-right corner. The [DevTools](#devtools) list the Message you sent and what it changed.

### How Messages travel in Foldkit 0.x vs. Effect UI

In Foldkit 0.x, the root update handled every Message. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update, which returned the next state. That state was put back into the single application Model, and the view ran from the root with the new Model.

In Effect UI, the runtime delivers a Message directly to the update of the Component it belongs to. It then stores that Component's new Model and runs its view. You keep the Elm Architecture's explicit state transitions, and you don't write the wiring that carries a Message through each parent.

The diagram below illustrates how each architecture handles a Message.

::Diagram{scenario="messages"}

### Foldkit 0.x vs. Effect UI code comparison

To render a child Component, the parent calls it in its view and passes props. The child declares its props with a Schema and reads them in init, update and view.

When the parent's view runs, the child's view runs again only if its props changed.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter"}

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own to keep it readable. The Component definition's helpers supply their types, so you don't have to annotate them.

::Listing{code="split"}

## State and data

### Shared state with Providers

In Foldkit 0.x, state that several Submodels needed lived in the Model of a parent they shared. Each level passed it down, and a Submodel communicated back up the tree with an OutMessage, which each parent forwarded until it reached the owner.

A Provider shares part of its Model with Components inside it, at any depth. In this example, CartProvider holds the cart count. CartCount reads that count, and AddToCart sends CartProvider a Message to change it. Product sits between CartProvider and AddToCart but passes no cart value or Message. Only CartProvider's update changes the count.

::Listing{code="provider"}

::Diagram{scenario="sharedState"}

### Data fetching with queries

In Foldkit 0.x, fetched data lived in the Model, and the parent drove the experimental `Query`: it stored it, forwarded its Messages and decided when to load or refresh. In Effect UI, you define a query once, a Component lists the queries it needs, and the runtime does the rest.

- **Fetching:** When the Component is rendered, and again when the query's arguments change. `debounce` waits until they settle.
- **Caching:** One result per query and arguments, kept by the runtime. Components that ask for the same data share one fetch.
- **Freshness:** A result older than `staleTime` stays on screen while the runtime refetches it.
- **States:** Each result is an `AsyncResult` in one of three states: no result yet, failure or success.

::Chips{label="Also built in" items="polling, refetch on focus and reconnect, load more, invalidation from Commands, optimistic updates, prefetch on link hover, server rendering, restore on Back and forward"}

::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: the parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: the Component lists its query"}

### Where state lives

In Foldkit 0.x, all of an app's state lived in its one Model. In Effect UI, state lives in four places:

| State                                                             | Where it lives            |
| ----------------------------------------------------------------- | ------------------------- |
| A Component's own state                                           | Its own Model             |
| State a parent or a [Provider](#shared-state-with-providers) owns | Another Component's Model |
| Data a [query](#data-fetching-with-queries) fetched               | The runtime's query cache |
| Which Commands are running                                        | The runtime               |

So a Model holds only the state that its own update changes, not everything the view shows. With logging enabled, you can still replay a Component's recorded state, because the log includes what update read from props, queries and Providers.

## Views and rendering

### Parts for headless Components

The components in Foldkit UI were headless: each one managed behavior, keyboard handling and ARIA, and you wrote the markup. Your `toView` callback received bundles of attributes, and you spread each bundle onto the element it belonged to.

In Effect UI, a headless Component gives your view parts instead. You apply each part to an element you write, then add your own classes and children. Here, `Details` draws a `Disclosure`:

::Listing{code="partsUse"}

To write a headless Component, you define `parts` instead of a view. The Component has its own Model, Messages and update, so it can keep its own state. This is the `Disclosure` that `Details` draws, with its open state in its own Model:

::Listing{code="partsDefine" whole="true"}

This means a Component can own the behavior, keyboard handling and ARIA, while you decide every element and class. You can also package behavior of your own this way and reuse it.

### Host-agnostic rendering

In Foldkit 0.x, the runtime rendered a view by patching the browser DOM directly.

Effect UI renders through a host rather than updating the DOM directly. The browser host creates DOM nodes, the server host writes HTML and the test host creates plain objects, so the same Components run in all three.

This doesn't mean you write one app and run it anywhere. A view is written with one host's elements: a view built from HTML elements needs a host that renders HTML, and a terminal app, with `@effect/ui-opentui`, writes its views with terminal elements. The runtime and the rest of a Component work the same on every host: its Model, Messages, update, Commands, Subscriptions and queries.

You choose the host when mounting the app. The entry point below uses `BrowserHost.mount`. The host interface is public, so you can also implement your own.

::Listing{code="mount"}

## Testing

### Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, you may replace that Model with `given`.

::Listing{code="tests"}

A test can also stand in for everything around the Component: a query's result, a Subscription's value, an event from a child, a Provider's value or new props from the parent. `Story.fromLog` replays a recorded message log against update and reports the first step that doesn't reproduce.

### Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component with its children on the [test host](#host-agnostic-rendering) and runs their Commands, Subscriptions and query fetches for real, against the Layers the test provides.

One test can now cover a whole flow. It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM.

`TestClock` controls time, so the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::PlayTest

## DevTools

Effect UI has an inspector that you add with one Layer, `DevTools.layer`. It's running on this page, behind the Effect UI button in the bottom-right corner.

- **Timeline:** Every Message from every Component in one list, each with the Model after it and what changed.
- **Cause and effect:** For any entry, the chain from what sent the Message to the Commands it issued and how each one ended.
- **Time travel:** Shows the page as it was at an earlier entry. The app keeps running underneath, and Resume returns to it.
- **For agents:** An MCP server gives an agent the same view. It can read the log, inspect a Component's state, show the page at an entry and, if you allow it, send Messages.

## Performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## Also new

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, the routes of a single app couldn't be split.
- **Control overlapping Commands:** When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.

## What stays the same

What people value in Foldkit 0.x carries over to Effect UI.

- **The same structure in every Component**
- **State that changes only in update, in response to a Message**
- **Side effects as values that the runtime runs**
- **Tests that account for every Command**
- **A message log you can inspect and replay**

## Try a snapshot build

Effect UI isn't on npm yet. Every commit to `main` is published as a snapshot build on [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). To install the latest one:

```sh
pnpm add effect \
  https://pkg.pr.new/Effect-TS/ui/@effect/ui@main \
  https://pkg.pr.new/Effect-TS/ui/@effect/ui-kit@main
```

To stay on one build, replace `main` with a commit's short SHA.

The [examples](https://github.com/Effect-TS/ui/tree/main/examples) in the repository are complete apps you can read and run.

## What happens next

We're making Effect UI public before it's finished so that you can help shape it. It doesn't have everything Foldkit 0.x has yet, but there is enough here to try it, get a feel for the new APIs and tell us what you think.

If you're building with Foldkit 0.x, keep going! It will receive critical bug fixes at least until Effect UI ships with an upgrade guide, and moving over will be an upgrade, not a rewrite.

Effect UI is developed in [Effect-TS/ui](https://github.com/Effect-TS/ui). Applicable Foldkit issues and pull requests will be transferred there, so you don't need to open them again.

Thank you to everyone building with Foldkit 0.x. What you've made with it, and what you've told us along the way, is what Effect UI is built on.

:::Footer
This article is built with Effect UI. [Browse the source](https://github.com/Effect-TS/ui/tree/main/examples/launch) in `examples/launch` in Effect-TS/ui.
:::
