---
title: Introducing Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect).

Effect UI is in public preview. If you're building with Foldkit 0.x, **the migration will be an upgrade, not a rewrite.**

This page is built with Effect UI. You can [read its source](https://github.com/Effect-TS/ui/tree/main/examples/launch) on GitHub.

## Explore with an AI agent

:::PageOnly
Not reading all that? Copy a prompt to explore it with an AI agent.
:::

:::AgentPrompts
::AgentPrompt{label="TL;DR" about="Paste into any AI agent that can read a web page." prompt="Read $URL. In under 200 words, say what Effect UI is and how it relates to Foldkit 0.x. Then list the main changes for someone with a Foldkit 0.x app, one line each, followed by what stays the same. Use only what the page says, and say so when it doesn't cover something."}

::AgentPrompt{label="Your Foldkit 0.x app" about="Paste into a coding agent that is open in your Foldkit 0.x project." prompt="Read $URL. Then look at this Foldkit 0.x project and find the three places where Effect UI would simplify the code most. For each, name the files and say what would go away. Then sketch the smallest one as an Effect UI Component, using only APIs the page shows. Don't edit any files: Effect UI is in public preview and has no upgrade guide yet."}
:::

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

Foldkit 0.x used the Elm Architecture, with the whole app as one program: one Model, one update and one view. That made every state change easy to follow, but it had costs as an app grew. Every Message ran the view from the root, every parent stored state and forwarded Messages for its children, and no part of an app could load from a chunk of its own.

Effect UI keeps the Elm Architecture and applies it to each Component. **A Component is an Elm Architecture program of its own, and you build an app by composing Components.**

::Architecture

A Component is self-contained. Its parent doesn't store its state or forward its Messages, so you can write, test and reuse it on its own. A Component can also bring its own services, load from a chunk of its own and fail while the rest of the app keeps running.

### Anatomy of a Component

This counter has every part of a Component. One definition holds its Model, Messages, init, update, subscriptions and view.

::Counter{code="intro" label="Live auto-counter"}

Click "+1", then click the Effect UI button in the bottom-right corner. [DevTools](#devtools) lists the Message you sent and what it changed.

`Html.component` defines a Component whose view builds HTML elements. Each platform has its own set of elements, called a vocabulary. `OpenTui.component`, from `@effect/ui-opentui`, defines a Component whose view builds terminal elements. **A Component has the same parts on every platform.** The view depends on the platform, and so do the Commands and Subscriptions that work with it: `HtmlCommand.focus` focuses an HTML element, and `OpenTuiCommand.focus` focuses a terminal one.

### How Messages travel in Foldkit 0.x vs. Effect UI

In Foldkit 0.x, the root update handled every Message. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update, which returned the next state. That state was put back into the single application Model, and the view ran from the root with the new Model.

In Effect UI, the runtime delivers a Message directly to the update of the Component it belongs to. It then stores that Component's new Model and runs its view. You keep the Elm Architecture's explicit state transitions, and you don't write the wiring that carries a Message through each parent.

The diagram below illustrates how each architecture handles a Message.

::Diagram{scenario="messages"}

### Foldkit 0.x vs. Effect UI code comparison

Here is the same small app in both: a Page that shows or hides a Counter.

In Foldkit 0.x, Page keeps the Counter's Model inside its own, wraps each of the Counter's Messages in a Message of its own and passes it on to the Counter's update. In Effect UI, Page calls Counter in its view and passes it props. **A parent no longer stores, wraps or forwards anything for its children.** Here, that makes Page about half as long.

When Page's view runs, Counter's view runs again only if its props changed.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter" example="counter"}

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own to keep it readable. The Component definition's helpers supply their types, so you don't have to annotate them.

::Listing{code="split"}

## State and data

### Shared state with Providers

In Foldkit 0.x, state that several Submodels needed lived in the Model of a parent they shared. Each level passed it down, and a Submodel communicated back up the tree with an OutMessage, which each parent forwarded until it reached the owner.

In Effect UI, a Provider shares part of its Model with Components inside it, at any depth. In this example, CartProvider holds the cart count. CartCount reads that count, and AddToCart sends CartProvider a Message to change it. Shop renders both and passes neither one a cart value or a Message. Only CartProvider's update changes the count.

::Listing{code="provider"}

::Diagram{scenario="sharedState"}

### Data fetching with queries

In Foldkit 0.x, fetched data lived in the Model, and the parent drove the `Query`: it stored it, forwarded its Messages and decided when to load or refresh. In Effect UI, **you define a query once, a Component lists the queries it needs, and the runtime fetches the data and keeps it in one cache for every Component.**

- **Fetching:** When the Component is rendered, and again when the query's arguments change. `debounce` waits until they settle.
- **Caching:** One result per query and arguments, kept by the runtime. Components that ask for the same data share one fetch.
- **Freshness:** A result older than `staleTime` stays on screen while the runtime refetches it.
- **States:** Each result is an `AsyncResult` in one of three states: no result yet, failure or success.

::Chips{label="Also built into queries" items="polling, refetch on focus and reconnect, load more, invalidation from Commands, optimistic updates, prefetch on link hover, server rendering, restore on Back and forward"}

::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: The parent stores and drives the Query" effect="queryEffect" effectTitle="Effect UI: The Component lists its query"}

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

### The UI kit

`@effect/ui-kit` has every component in [Base UI](https://base-ui.com/), 37 in all, plus a virtual list and three utilities.

::Kit

### Host-agnostic rendering

In Foldkit 0.x, the runtime rendered a view by patching the browser DOM directly.

Effect UI renders through a host rather than updating the DOM directly. The browser host creates DOM nodes, the server host writes HTML and the test host creates plain objects, so the same Components run in all three.

A host renders one vocabulary. The browser and server hosts render HTML elements, and the terminal host in `@effect/ui-opentui` renders terminal elements. The test host accepts either.

You choose the host when mounting the app. The entry point below uses `BrowserHost.mount`. The host interface is public, so you can also implement your own.

::Listing{code="mount"}

## Testing

### Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, you may replace that Model with `given`.

::Listing{code="tests"}

A test can also stand in for everything around the Component: a query's result, a Subscription's value, an event from a child, a Provider's value or new props from the parent. `Story.fromLog` replays a recorded message log against update and reports the first step that doesn't reproduce.

### Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component with its children on the [test host](#host-agnostic-rendering) and runs their Commands, Subscriptions and query fetches for real, against the Layers the test provides.

**A Play test can cover a whole flow.** It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM.

`TestClock` controls time, so the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

Step through that test below, then open the other tabs. "Sign in" tests a whole flow from the [auth example](https://github.com/Effect-TS/ui/tree/main/examples/auth): a form, a request that takes a second, a session store and a router. "Snake" tests the [Snake example](https://github.com/Effect-TS/ui/tree/main/examples/snake): it presses keys and moves the clock.

The figure runs each test in your browser, on the test host. The panel beside the code is a sketch that this page draws from the tree the test host holds after each line. A Play test itself draws nothing.

::PlayTest

## DevTools

:::LauncherPointer
Effect UI has an inspector that you add with one Layer, `DevTools.layer`. It's running on this page, behind the Effect UI button in the bottom-right corner.

- **Timeline:** Every Message from every Component in one list, each with the Model after it and what changed.
- **Cause and effect:** For any entry, the chain from what sent the Message to the Commands it issued and how each one ended.
- **Time travel:** Shows the page as it was at an earlier entry. The app keeps running underneath, and Resume returns to it.
- **For agents:** An MCP server gives an agent the same view. It can read the log, inspect a Component's state, show the page at an entry and, if you allow it, send Messages.

:::

## Performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI spent less time running JavaScript overall than Foldkit 0.x, painted sooner and used less memory. The chart highlights Effect UI among all seven entries we ran on the same machine.

::PerformanceChart

::AllResults

## Also new

- **Services per Component:** Provide services to a Component and everything below it with `Component.provide`. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The chunk loads the first time the Component is rendered, so it stays out of the initial bundle. In Foldkit 0.x, an app's Model, update and view all loaded in one bundle.
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

**If you're building with Foldkit 0.x, keep going!** Feature work has moved to Effect UI, but Foldkit 0.x will receive critical bug fixes at least until Effect UI ships with an upgrade guide. Moving over will be an upgrade, not a rewrite.

Effect UI is developed in [Effect-TS/ui](https://github.com/Effect-TS/ui). Applicable Foldkit issues and pull requests will be transferred there, so you don't need to open them again.

Thank you to everyone building with Foldkit 0.x. What you've made with it, and what you've told us along the way, is what Effect UI is built on.

:::Footer
This article is built with Effect UI. [Browse the source](https://github.com/Effect-TS/ui/tree/main/examples/launch) in `examples/launch` in Effect-TS/ui.
:::
