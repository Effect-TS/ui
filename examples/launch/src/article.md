---
title: Introducing Effect UI
---

Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at [foldkit.dev](https://foldkit.dev). We announced it as the "new frontend foundation" in [Foldkit Joins Effect](https://foldkit.dev/blog/foldkit-joins-effect).

Effect UI is in public preview. If you're building with Foldkit 0.x, **the migration will be an upgrade, not a rewrite.**

We built this page with Effect UI. You can [read its source](https://github.com/Effect-TS/ui/tree/main/examples/launch) on GitHub.

## Explore with an AI agent

:::PageOnly
Not reading all that? Copy a prompt to explore it with an AI agent.
:::

:::AgentPrompts
::AgentPrompt{label="TL;DR" about="Paste into any AI agent that can read a web page." prompt="Read $URL. In under 200 words, say what Effect UI is and how it relates to Foldkit 0.x. Then list the main changes for someone with a Foldkit 0.x app, one line each, followed by what stays the same. Use only what the page says, and say so when it doesn't cover something."}

::AgentPrompt{label="Your Foldkit 0.x app" about="Paste into a coding agent that is open in your Foldkit 0.x project." prompt="Read $URL. Then look at this Foldkit 0.x project and find the three places where Effect UI would simplify the code most. For each, name the files and say what would go away. Then sketch the smallest one as an Effect UI Component, using only APIs the page shows. Don't edit any files. Effect UI is in public preview and has no upgrade guide yet."}
:::

## What this article covers

This article covers the main changes from Foldkit 0.x to Effect UI, not every API change:

- [Components](#components)
- [State and data](#state-and-data)
- [Views and rendering](#views-and-rendering)
- [Testing](#testing)
- [DevTools](#devtools)
- [Performance](#performance)

## Terms

- **Foldkit 0.x** is the existing frontend framework at [foldkit.dev](https://foldkit.dev).
- **Effect UI** is the new frontend library that continues the work of Foldkit 0.x. You import it from `@effect/ui`.
- **Foldkit** is the future full-stack framework. Effect UI will be its frontend.

## Components

Foldkit 0.x used the Elm Architecture, with the whole app as one program: one Model, one update and one view. That made every state change easy to follow, but it had costs as an app grew. Every Message ran the view from the root. Every parent stored state and forwarded Messages for its children. No part of an app could load in its own chunk.

Effect UI keeps the Elm Architecture and applies it to each Component. **A Component is an Elm Architecture program of its own, and you build an app by composing Components.**

::Architecture

A Component is self-contained. Its parent doesn't store its state or forward its Messages, so you can write and test it on its own. A Component can provide its own services and load in its own chunk. If a Component fails, the rest of the app keeps running.

### Anatomy of a Component

This counter shows the core parts of a Component. One definition holds its Model, Messages, init, update, subscriptions and view.

::Counter{code="intro" label="Live auto-counter"}

Click "+1", then click the Effect UI button in the bottom-right corner. [DevTools](#devtools) lists the Message you sent and what it changed.

`Html.component` defines a Component whose view builds HTML elements. Each platform has its own set of elements, called a vocabulary. `OpenTui.component`, from `@effect/ui-opentui`, defines a Component whose view builds terminal elements. **A Component has the same parts on every platform.** The view depends on the platform, and so do the effects that work with its elements. For example, `HtmlCommand.focus` focuses an HTML element, and `OpenTuiCommand.focus` focuses a terminal one.

### How Foldkit 0.x and Effect UI handle Messages

In Foldkit 0.x, the root update handled every Message. When a Message belonged to a Submodel, the root update passed it down to that Submodel's update. The Submodel returned its next state, the root update wrote it back into the application Model, and the runtime ran the view from the root.

In Effect UI, the runtime delivers a Message to that Component's update, skipping every parent. It stores the Component's new Model and runs its view. You keep the Elm Architecture's explicit state transitions without writing the wiring to pass Messages through each parent.

::Diagram{scenario="messages"}

### Foldkit 0.x and Effect UI in code

Both examples below build the same app: a `Page` that shows or hides a `Counter`.

In the Foldkit 0.x version, `Page` stores `Counter`'s Model inside its own Model. It wraps each `Counter` Message in a `Page` Message and forwards it to `Counter`'s update. In the Effect UI version, `Page` calls `Counter` in its view and passes it props. **A parent no longer stores, wraps or forwards anything for its children.** Here, `Page` drops from 62 lines to 34.

When `Page`'s view runs, `Counter`'s view runs again only if its props changed.

::Compare{foldkit="counterFoldkit" foldkitTitle="Foldkit 0.x: Page stores and forwards for Counter" effect="counterEffect" effectTitle="Effect UI: Page renders Counter" example="counter"}

### Organizing larger Components

As a Component grows, you can still move init, update, subscriptions and view into functions of their own. The Component definition's helpers supply their types, so you don't have to annotate them.

::Listing{code="split"}

## State and data

### Shared state with Providers

In Foldkit 0.x, a shared parent held state that several Submodels needed in its Model. Every parent between them passed that state down. To change it, a Submodel returned an OutMessage, and every parent forwarded it back up to the owner.

In Effect UI, a Provider shares part of its Model with Components inside it, at any depth. In this example, `CartProvider` holds the cart count. `CartCount` reads that count, and `AddToCart` sends `CartProvider` a Message to change it. `Shop` renders both and passes neither one a cart value or a Message. Only `CartProvider`'s update changes the count.

::Listing{code="provider"}

::Diagram{scenario="sharedState"}

### Data fetching with queries

In Foldkit 0.x, the Model held fetched data, and the parent managed the `Query`. The parent stored the query state, forwarded its Messages and decided when to load or refresh. In Effect UI, **you define a query once and list it on the Components that need it.** The runtime fetches the data and keeps it in one cache for every Component.

- **Fetching:** The runtime fetches when the Component renders, and again when the query's arguments change. Setting `debounce` waits until the arguments stop changing.
- **Caching:** The runtime keeps one result per query and arguments. Components that ask for the same data share one fetch.
- **Freshness:** A result older than `staleTime` stays on screen while the runtime refetches it.
- **States:** Each result is an `AsyncResult`: either no result yet, failure or success.

::Chips{label="Also built into queries" items="polling, refetch on focus and reconnect, load more, invalidation from Commands, optimistic updates, prefetch on link hover, server rendering, restore on back and forward"}

::Compare{foldkit="queryFoldkit" foldkitTitle="Foldkit 0.x: The parent stores and manages the Query" effect="queryEffect" effectTitle="Effect UI: The Component lists its query"}

### Where state is stored

In Foldkit 0.x, one Model held all of an app's state. In Effect UI, state is stored in four places:

| State                                                             | Stored in                 |
| ----------------------------------------------------------------- | ------------------------- |
| A Component's own state                                           | Its own Model             |
| State a parent or a [Provider](#shared-state-with-providers) owns | Another Component's Model |
| Data a [query](#data-fetching-with-queries) fetched               | The runtime's query cache |
| Which Commands are running                                        | The runtime               |

A Model holds only the state that its own update changes, not everything the view shows. With logging enabled, you can still replay a Component's recorded Messages, because the log includes what update read from props, queries and Providers.

## Views and rendering

### Parts for headless Components

The components in Foldkit UI were headless. Each one managed behavior, keyboard handling and ARIA while you wrote the markup. Your `toView` callback received bundles of attributes, and you spread each bundle onto the element it belonged to.

In Effect UI, a headless Component gives your view parts instead. You apply each part to an element you write, then add your own classes and children. Here, `Details` renders a `Disclosure`:

::Listing{code="partsUse"}

To write a headless Component, you define `parts` instead of a view. The Component has its own Model, Messages and update, so it can keep its own state. This is the `Disclosure` that `Details` renders, with its open state in its own Model:

::Listing{code="partsDefine" whole="true"}

A Component owns the behavior, keyboard handling and ARIA while you control every element and class. You can package your own behavior the same way and reuse it.

### The UI kit

**`@effect/ui-kit` already ships 41 components**, so you don't have to build accessible UI from scratch. The kit has every component in [Base UI](https://base-ui.com/), plus VirtualList, VirtualKeyboard, DirectionProvider and Positioning. They're all headless. Each handles keyboard, focus and ARIA while you write the markup and styles.

Here is the full set of 41 components. Hover or tap to animate.

::Kit

### Host-agnostic rendering

In Foldkit 0.x, the runtime rendered a view by patching the browser DOM.

Effect UI renders through a host instead, and each host handles one vocabulary of elements. For HTML, the browser host creates DOM nodes, the server host writes HTML and the test host creates plain objects. The same HTML Components run on all three.

Other platforms have their own vocabulary and host, such as the terminal host in `@effect/ui-opentui`. The test host accepts any vocabulary. An HTML Component won't render in a terminal, because Effect UI doesn't translate one view across platforms. You write views for each platform's own elements, with the same Component runtime.

You choose the host when mounting the app. The entry point below uses `BrowserHost.mount`. The host interface is public, so you can also implement your own.

::Listing{code="mount"}

## Testing

### Story and Scene tests

A Story test sends Messages to update, and a Scene test does the same through the view. In Foldkit 0.x, you passed those functions and a starting Model with `given`. In Effect UI, you pass the Component, and the test starts from the Model its init returns. To start from a different state, you can replace that Model with `given`.

::Listing{code="tests"}

A test can also supply test values for everything around the Component: a query's result, a Subscription's value, an event from a child, a Provider's value or new props from the parent.

You can also replay a recorded session with `Story.fromLog`. When logging is enabled, the runtime records every Message a Component receives, along with the props, query results and Provider values its update read. `Story.fromLog` re-runs those Messages against update without running Commands, and reports the first step where the Component produces a different Model, Command or event.

### Play tests

Play is a new kind of test in Effect UI. In Story and Scene tests, you resolve each Command by hand, so the Command itself never runs. A Play test mounts the Component and its children on the [test host](#host-agnostic-rendering). It runs their real Commands, Subscriptions and query fetches against the Layers the test provides.

**A Play test can cover a whole flow.** It clicks a button, lets the real Command run and checks what is on screen afterwards, with no browser and no DOM.

`TestClock` controls time, so the delayed-reset Play test below can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms.

::PlayTest

## DevTools

:::LauncherPointer
Effect UI has an inspector that you add with one Layer, `DevTools.layer`. It's running on this page, behind the Effect UI button in the bottom-right corner.

- **Timeline:** One list holds every Message from every Component, the Model after it and what changed.
- **Cause and effect:** For any entry, DevTools traces what sent the Message, the Commands it issued and how each one ended.
- **Time travel:** Pick an earlier entry to see the page at that point. The live app keeps running, and Resume returns to it.
- **For agents:** An MCP server gives an agent the same view. It can read the log, inspect a Component's state and show the page at any entry. If you allow it, the agent can also send Messages.

:::

## Performance

In [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), Effect UI scored 4.06× vanilla JavaScript across the nine script operations, compared to 6.27× for Foldkit 0.x. It reached first paint in 363 ms instead of 737 ms, and used 4.1 MB of memory with 1,000 rows instead of 6.1 MB. We ran all seven entries on the same machine.

::PerformanceChart

::AllResults

## Also new

- **Services per Component:** `Component.provide` gives services to a Component and everything below it. Its Commands and Subscriptions use them, and TypeScript reports a missing service at compile time.
- **Code splitting:** Load a Component from a chunk of its own with `Component.lazy`. The browser loads the chunk the first time the Component renders, so it stays out of the initial bundle. In Foldkit 0.x, an app's Model, update and view all loaded in one bundle.
- **Control overlapping Commands:** When an update issues a Command that is still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it.

## What stays the same

Effect UI keeps these parts of Foldkit 0.x:

- **The same structure in every Component**
- **State that changes only in update, in response to a Message**
- **Side effects as values that the runtime runs**
- **Tests that account for every Command**
- **A Message log you can inspect and replay**

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

We're making Effect UI public before it's finished so you can help shape it. It doesn't have everything Foldkit 0.x has yet, but you can try the new APIs and tell us what you think.

**If you're building with Foldkit 0.x, keep going!** Feature work has moved to Effect UI, but Foldkit 0.x will get critical bug fixes at least until Effect UI ships with an upgrade guide. Migrating will be an upgrade, not a rewrite.

We develop Effect UI in [Effect-TS/ui](https://github.com/Effect-TS/ui). We'll transfer Foldkit issues and pull requests that apply to Effect UI there, so you don't need to open them again.

Thank you to everyone building with Foldkit 0.x. What you've made with it, and what you've told us along the way, is what Effect UI is built on.

:::Footer
We built this page with Effect UI. [Read the source](https://github.com/Effect-TS/ui/tree/main/examples/launch) in `examples/launch` in Effect-TS/ui.
:::
