import { Code } from "#components/Code"
import { Diagram } from "#components/Diagram"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./autocounter/Counter.ts"
import { Counter as FragmentCounter } from "./autocounter/fragment/Counter.ts"
import { Scoreboard } from "./autocounter/headless/Scoreboard.ts"
import { Page } from "./counter/effect/Page.ts"
import { EmbedFoldkitPage } from "./counter/FoldkitEmbed.ts"
import { AllResults, PerformanceChart } from "./performance/Chart.ts"
import { links } from "./performance/Results.ts"

const Example = <M>(h: View.H<M>, options: {
  readonly title: string
  readonly files: ReadonlyArray<Snippet>
  readonly demo?: View.Content<M>
}) =>
  h.section.class("example").attr("aria-label", options.title).children(
    h.h3.class("example-title").children(options.title),
    h.div.class("example-body").children(
      options.demo && h.div.class("demo").children(options.demo),
      ...Files(h, options.files)
    )
  )

const Files = <M>(h: View.H<M>, files: ReadonlyArray<Snippet>) =>
  files.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet)))

const Caption = <M>(h: View.H<M>, text: string) => h.figcaption.class("caption").children(...Text(h, text))

const Listing = <M>(h: View.H<M>, files: ReadonlyArray<Snippet>, caption?: string) =>
  h.figure.class("listing wide").children(...Files(h, files), caption && Caption(h, caption))

const Beside = <M>(h: View.H<M>, options: {
  readonly label: string
  readonly files: ReadonlyArray<Snippet>
  readonly demo: View.Content<M>
  readonly caption: string
}) =>
  h.figure.class("beside wide").children(
    h.div.class("beside-columns").children(
      h.div.class("beside-code").children(...Files(h, options.files)),
      h.div.class("demo beside-demo").attr("role", "group").attr("aria-label", options.label).children(options.demo)
    ),
    Caption(h, options.caption)
  )

const Compare = <M>(h: View.H<M>, options: {
  readonly foldkit: { readonly title: string; readonly files: ReadonlyArray<Snippet> }
  readonly effect: { readonly title: string; readonly files: ReadonlyArray<Snippet> }
  readonly caption?: string
}) =>
  h.figure.class("compare wide").children(
    h.div.class("compare-columns").children(Example(h, options.foldkit), Example(h, options.effect)),
    options.caption && Caption(h, options.caption)
  )

const Text = <M>(h: View.H<M>, text: string) =>
  text.split("`").map((part, index) => index % 2 === 0 ? part : h.code.children(part))

const P = <M>(h: View.H<M>, text: string) => h.p.children(...Text(h, text))

export const LaunchPage = Component.define({
  name: "LaunchPage",
  scoped: false,
  props: Schema.Struct({ snippets: Snippets }),
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  head: () => [Head.title("Effect UI succeeds Foldkit 0.x's frontend")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Effect UI succeeds Foldkit 0.x's frontend"),
        P(
          h,
          "Foldkit 0.x is the frontend framework on npm today as `foldkit`. Its frontend continues as Effect UI (`effect/ui`), while Foldkit becomes the full-stack framework built on top of it."
        ),
        P(
          h,
          "If you've built an app with Foldkit 0.x, most of your mental model carries over: Schema Models, fact-based Messages, pure update functions, and declarative Commands and Subscriptions. This post walks through what is changing, why we made those changes, and what Effect UI looks like in practice."
        )
      ),
      h.section.attr("aria-labelledby", "define").children(
        h.h2.id("define").children("A component declares its Model and Messages, then defines its behavior and view"),
        P(
          h,
          "Start with a complete component: a counter that increments on click, resets after a one-second delay, and ticks automatically when auto-count is turned on."
        ),
        Beside(h, {
          label: "Counter",
          files: h.props.snippets.intro,
          demo: Counter(h, { key: "intro" }),
          caption: "Try it live: click Reset in 1 second, or toggle Auto-count on and off."
        }),
        P(
          h,
          "`Component.define` declares the component's name and Schemas, and `.make` attaches its `init`, `update`, `subscriptions`, and `view`. Instead of a `Message.match` switch, `update` is a record keyed by Message tag."
        ),
        P(
          h,
          "`DelayReset` is a Command that sleeps for one second and produces `CompletedDelayReset`. When the user clicks reset, `ClickedResetAfterDelay` returns `$.run(DelayReset.make({}))` without running any side effect itself. The runtime executes the Command and sends `CompletedDelayReset` back into `update`, which zeroes the count. While it is in flight, `h.isRunning(DelayReset)` is `true`, so the button shows \"Resetting\". In Foldkit 0.x, that same handler returned `{ model, commands: [DelayReset] }`."
        ),
        P(
          h,
          "Subscriptions are plain data derived from the Model. `subscriptions` returns the list of Streams that should be active right now: when `isAutoCounting` is `true`, `tick` is in the list and emits `Ticked` every second; when it flips to `false`, `tick` drops out and the runtime tears down the Stream automatically. There is no `modelToDependencies` or `dependenciesToStream` boilerplate — just an ordinary `&&`."
        )
      ),
      h.section.attr("aria-labelledby", "split").children(
        h.h2.id("split").children("The component definition types handlers and views written separately"),
        P(
          h,
          "When a component outgrows a single inline call, assign `Component.define(...)` to a variable and write each piece separately before calling `.make`. The definition carries the types for `$`, `h`, and every Message, so extracted handlers and views don't need manual type annotations."
        ),
        Listing(h, h.props.snippets.split),
        P(
          h,
          "`CounterDef.update(\"ClickedResetAfterDelay\", ...)` types a handler for one specific Message. Omit the tag — `CounterDef.update(...)` — and you get a shared handler that works for any Message, like `increment` serving both `ClickedIncrement` and `Ticked`."
        ),
        P(
          h,
          "The definition provides typed helpers for `update`, `view`, and `fragment`. `init` and `subscriptions` don't need helpers; they are ordinary functions annotated with the `Model` type. Keep small components chained inline, and split them out once they grow."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("In Foldkit 0.x, the whole app shared one Model"),
        P(
          h,
          "A Foldkit 0.x application has a single Model, a single Message union, and a single `update` function. Everything the app knows lives in that root Model, and every Message flows through that root `update`."
        ),
        P(
          h,
          "You can organize code into Submodels — reusable modules with their own Model, Message, `update`, and `view` — so you only have to write a Counter once. What a Submodel doesn't have is its own state at runtime. The parent stores the Submodel's Model as a field, wraps its Messages in a parent Message, unwraps them in `update`, forwards them to the Submodel's `update`, and stores the updated Model."
        ),
        P(
          h,
          "In a small app that wiring is manageable. In a real app, parents end up forwarding Messages for every child on the page, even when the parent has no interest in what those children are doing."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children(
          "Each component instance stores its own Model and handles its own Messages"
        ),
        P(
          h,
          "An Effect UI app is a tree of independent components. Each component instance has its own Model, Message union, and `update`, managed by the runtime. When a user interacts with a child, the runtime sends that Message straight to that child's `update` — the parent never stores the child's state or routes its Messages."
        ),
        P(
          h,
          "Compare a page with a Counter and a toggle button written both ways. The diagram traces a single click on `+`."
        ),
        Diagram(h, "One click on + in each version. Numbers show the execution order."),
        h.figure.class("compare wide").children(
          h.div.class("compare-columns").children(
            Example(h, {
              title: "Foldkit 0.x: Page stores and routes Counter",
              files: h.props.snippets.counterFoldkit,
              demo: h.div.class("embed").onMount(EmbedFoldkitPage())
            }),
            Example(h, {
              title: "Effect UI: Page just renders Counter",
              files: h.props.snippets.counterEffect,
              demo: Page(h, {})
            })
          ),
          h.figcaption.class("caption").children(
            "Both demos are live. Increment each counter, then hide and show it again."
          )
        ),
        P(
          h,
          "The two `Counter` files have the same Model, Messages, and update logic. The difference is all in `Page`. In Effect UI, the `counter` field on the parent Model, the `GotCounterMessage` wrapper, and `foldCounter` all disappear, and `h.submodel` becomes a direct `Counter(h, {})` call. The page's `update` only handles `ClickedToggleCounter` — the one event it actually cares about."
        ),
        P(
          h,
          "You don't lose observability by splitting state up: every Message still goes through an `update`, and `MessageLog` records each step under the component instance's path."
        )
      ),
      h.section.attr("aria-labelledby", "lifetime").children(
        h.h2.id("lifetime").children("Component state lives as long as the component is rendered, by default"),
        P(
          h,
          "If you hid and showed both counters above, you saw the difference immediately: Foldkit 0.x kept the count, while Effect UI reset it to 0."
        ),
        P(
          h,
          "In Foldkit 0.x, a Submodel's state lives in its parent's Model until the parent explicitly replaces it. Toggling `isCounterShown` left `counter` untouched, so the count survived. Resetting it meant remembering to re-initialize `counter` inside the parent's `update`."
        ),
        P(
          h,
          "In Effect UI, a component's state is tied to its lifecycle. When `isCounterShown` becomes `false`, the parent stops rendering `Counter`, so the runtime unmounts it and discards its Model. Showing it again creates a fresh instance starting at 0."
        ),
        P(
          h,
          "When state should survive being hidden — like a draft inside a tab the user switched away from — opt in with `scoped: true` on the component and render it through `h.scoped`. When the view stops rendering it, its DOM nodes are removed, but its Model, Subscriptions, and in-flight Commands stay alive until the parent unmounts or a predicate passed to `h.scoped` returns `false`."
        ),
        h.figure.class("kept").children(
          ...h.props.snippets.kept.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet))),
          h.figcaption.class("caption").children(
            ...Text(h, "Two lines change, and the Effect UI Counter keeps its count while hidden.")
          )
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("Components can provide their own Effect services"),
        P(
          h,
          "Suppose an editor saves drafts through a `Drafts` service."
        ),
        P(
          h,
          "In Foldkit 0.x, the editor's Command requires `Drafts`. To share one `Drafts` instance across Commands, you pass `Drafts.layer` to `makeApplication` in `resources`. The runtime builds that Layer the first time any Command or Subscription runs — even one that doesn't need `Drafts` — keeps it alive for the life of the app, and exposes it to every Command."
        ),
        P(
          h,
          "If you forget to add `Drafts.layer` to `resources`, the app still compiles and then crashes at runtime with \"Service not found: Drafts\" the first time you save. The alternative — providing `Drafts` inside the Command's own Effect — rebuilds the service on every single run."
        ),
        Compare(h, {
          foldkit: {
            title: "Foldkit 0.x: Drafts provided at the app root",
            files: h.props.snippets.providerFoldkit
          },
          effect: {
            title: "Effect UI: Editor provides Drafts directly",
            files: h.props.snippets.providerEffect
          },
          caption:
            "Foldkit 0.x configures `Drafts` globally at the root. Effect UI scopes it to `Editor`, right where the component is defined."
        }),
        P(
          h,
          "`Component.provide` works like `Effect.provide` for a component and its subtree. Because `Editor` exports itself with its Layers already attached, any page can render `Editor(h, {})` without wiring up dependencies."
        ),
        P(
          h,
          "If a page renders two Editors, each keeps its own text while sharing a single `Drafts` instance. The runtime builds `Drafts` when the first Editor mounts and releases it when the last one unmounts — removing one Editor discards its text without disrupting the other."
        ),
        P(
          h,
          "Exporting `EditorNoDeps` alongside `Editor` keeps dependencies testable. Mounting `EditorNoDeps` carries the `SaveDraft` requirement in the type system, so TypeScript won't let you run the app until something provides it — and a test can swap in a fake `SaveDraft` Layer."
        )
      ),
      h.section.attr("aria-labelledby", "noop").children(
        h.h2.id("noop").children("Fire-and-forget Commands don't need dummy Messages"),
        P(
          h,
          "In Foldkit 0.x, every Command has to return a Message, even when `update` has nothing to do with it. Saving a draft doesn't change the editor's Model, so the Foldkit 0.x version still has to declare `SavedDraft` and add a no-op handler that returns the Model unchanged."
        ),
        Compare(h, {
          foldkit: {
            title: "Foldkit 0.x: declares SavedDraft just to ignore it",
            files: h.props.snippets.noopFoldkit
          },
          effect: {
            title: "Effect UI: pipes SaveDraft through Command.asNoop",
            files: h.props.snippets.noopEffect
          }
        }),
        P(
          h,
          "With `Command.asNoop`, the runtime still runs `SaveDraft`, then maps its result to `Component.noop` so no follow-up Message reaches `update`. The Effect UI Editor has one Message instead of two."
        ),
        P(
          h,
          "Only reach for `Command.asNoop` when `update` truly ignores the result. Take `DelayReset` from the counter above: `CompletedDelayReset` is what actually sets `count` back to 0. Piping `DelayReset` into `Command.asNoop` would still compile, wait a second, and leave the count unchanged."
        )
      ),
      h.section.attr("aria-labelledby", "headless").children(
        h.h2.id("headless").children("Headless components separate behavior from markup"),
        P(
          h,
          "Replace `view` with `parts` and a component becomes headless: it keeps its Model, `update`, Commands, and Subscriptions, while leaving all markup and styling to the caller. Below, the same headless `Counter` powers two different UIs — a compact inline counter and a scoreboard with auto-count."
        ),
        Beside(h, {
          label: "Two UIs built from the headless Counter",
          files: h.props.snippets.headless,
          demo: Scoreboard(h, {}),
          caption: "Both counters are live and maintain independent counts."
        }),
        P(
          h,
          "The parent supplies the elements, classes, and labels. Calling `counter.increment(h.button)` attaches the component's click handler to the parent's button, so clicks still flow straight into `Counter`'s `update`. Each keyed placement (`compact` and `scoreboard`) is its own instance with its own count."
        ),
        P(
          h,
          "This is the same pattern used across `@effect/ui-kit` for accessible primitives like Select and Collapsible."
        )
      ),
      h.section.attr("aria-labelledby", "fragment").children(
        h.h2.id("fragment").children("Fragments extract reusable pieces of a view"),
        P(
          h,
          "Sometimes you want to pull part of a component's view into a helper function without creating a separate component. Here, the counter's delayed-reset button is extracted into a fragment that disables itself and shows \"Resetting\" while `DelayReset` is running."
        ),
        Beside(h, {
          label: "Counter with a reset fragment",
          files: h.props.snippets.fragment,
          demo: FragmentCounter(h, { key: "fragment" }),
          caption: "Click Reset in 1 second. The button disables itself until the reset completes."
        }),
        P(
          h,
          "`CounterDef.fragment` gives the function the same typed `h` that `view` receives — so it can dispatch the component's Messages and call `h.isRunning` with no type annotations — followed by whatever extra arguments you want to pass."
        )
      ),
      h.section.attr("aria-labelledby", "testing").children(
        h.h2.id("testing").children("Story and Scene supply Command results; Play runs Commands and Subscriptions"),
        P(
          h,
          "Each test below covers the same delayed reset."
        ),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Story: passes update", files: h.props.snippets.storyFoldkit },
          effect: { title: "Effect UI Story: passes the component", files: h.props.snippets.storyEffect }
        }),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Scene: passes update and view", files: h.props.snippets.sceneFoldkit },
          effect: { title: "Effect UI Scene: passes the component", files: h.props.snippets.sceneEffect }
        }),
        P(
          h,
          "`Story` still tests `update` by sending Messages and inspecting the Model; `Scene` still drives interactions through the rendered view. In both, Commands stay pending as data until the test resolves them by name, and any unresolved Command fails the test."
        ),
        P(
          h,
          "Three ergonomics changed from Foldkit 0.x: you pass the component directly instead of `update` (or `update` and `view`); the test starts from `init` rather than a hand-crafted initial Model; and steps run on a cursor so you can read `s.model` between steps with normal assertions."
        ),
        Listing(
          h,
          h.props.snippets.play,
          "Play is new in Effect UI — it runs real Commands, Subscriptions, and child components."
        ),
        P(
          h,
          "Because `Story` and `Scene` resolve `DelayReset` manually, they pass regardless of what `DelayReset` actually does at runtime. `Play` executes the real Command against `TestClock`, proving the count stays at 1 after 999ms and resets to 0 at 1 second."
        ),
        P(
          h,
          "The same applies to Subscriptions. A `Story` can check that `tick` is active and send a synthetic `Ticked`, but only `Play` runs the Stream itself — if you accidentally removed `Stream.drop(1)`, the `Story` would still pass while `Play` would catch that the count hit 4 after three seconds instead of 3."
        ),
        P(
          h,
          "`Play` also mounts real child components end to end, so you no longer have to test a Command's Effect separately with a mock Layer like Foldkit 0.x recommended."
        )
      ),
      h.section.attr("aria-labelledby", "performance").children(
        h.h2.id("performance").children("Performance on js-framework-benchmark"),
        h.p.children(
          "We ran Effect UI and Foldkit 0.x through ",
          h.a.attr("href", links.harness).children("js-framework-benchmark"),
          ", the keyed table benchmark most UI frameworks publish numbers for, alongside React, Vue, Svelte, Solid, and vanilla JS. Every entry renders the same table, and the harness times each operation from the click to the next paint."
        ),
        PerformanceChart(h),
        P(
          h,
          "The first group shows script time: the JavaScript that runs between the click and the paint. Painting 1,000 rows took about 100 ms on the test machine whatever the framework, so script time separates the frameworks better than total time. Effect UI runs less JavaScript than Foldkit 0.x on seven of the nine operations, and less than half as much to create 10,000 rows. Foldkit 0.x is faster at swapping two rows, and the two are level on removing one."
        ),
        P(
          h,
          "Effect UI also ships a smaller bundle, paints first sooner, and uses less memory. Vue, Svelte, and Solid are still ahead of both on most operations, most of all on small updates. Effect UI runs `update` and the whole `view` for each Message and compares every row's arguments to find the few that changed, while Svelte and Solid write only the DOM nodes that depend on the changed state."
        ),
        AllResults(h)
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("Messages still report facts; update still decides what changes"),
        P(
          h,
          "Underneath the component model, the core architecture hasn't changed. Models are still Schemas. Messages still describe facts that happened — like `ClickedSave` — and `update` decides how state transitions. `init`, `update`, and `view` remain pure functions, and Commands, Subscriptions, and Mounts are still declarative values executed by the runtime."
        ),
        P(
          h,
          "Data flow is still strictly one-way. A child never knows anything about its parent; instead of returning an `OutMessage`, it emits a typed event and lets the parent decide what it means."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("You can reuse your Models, Messages, and update logic"),
        h.p.children(
          "The upgrade guide isn't published yet. When it is, it will walk through the API changes step by step. Expect a migration rather than a rewrite: your Models, Messages, and update logic move over with minimal changes, and most of the diff is deleting parent forwarding boilerplate. Follow along with Effect UI ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("on GitHub"),
          "."
        )
      ),
      h.footer.class("footer").children(
        P(h, "This page is built with Effect UI. Browse its source in `examples/launch` in Effect-TS/ui.")
      )
    )
})
