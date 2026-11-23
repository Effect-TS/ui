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
import { WidgetPage } from "./failure/WidgetPage.ts"
import { PanelPage } from "./lazy/PanelPage.ts"
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
  head: () => [Head.title("Foldkit 0.x's frontend continues as Effect UI")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Foldkit 0.x's frontend continues as Effect UI"),
        P(
          h,
          "The frontend framework published on npm as `foldkit` continues as Effect UI (`effect/ui`), while Foldkit becomes the full-stack framework built on top of it."
        ),
        P(
          h,
          "We kept the core that made Foldkit 0.x predictable: Schema Models, fact-based Messages, pure `update` functions, and declarative Commands and Subscriptions. What changed is how apps scale past a single root Model. In Foldkit 0.x, growing a codebase meant threading child state, wrapped Messages, and shared resource Layers through the top of the app. In Effect UI, each component instance owns its state and lifecycle, and components can scope Effect Layers to their subtrees, while keeping the one-way data flow and observability you already rely on."
        )
      ),
      h.section.attr("aria-labelledby", "define").children(
        h.h2.id("define").children("Define a component's Model, Messages, and view in one place"),
        P(
          h,
          "Start with a working component: a counter that increments on click, resets after a one-second delay, and ticks automatically when auto-count is on."
        ),
        Beside(h, {
          label: "Counter",
          files: h.props.snippets.intro,
          demo: Counter(h, { key: "intro" }),
          caption: "Try it live: click Reset in 1 second, or toggle Auto-count on and off."
        }),
        P(
          h,
          "`Component.define` declares the component's name and Schemas, and `.make` attaches `init`, `update`, `subscriptions`, and `view`. `update` is a record keyed by Message tag, replacing the `Message.match` switch from Foldkit 0.x."
        ),
        P(
          h,
          "`DelayReset` is a Command that sleeps for one second and returns `CompletedDelayReset`. When someone clicks reset, `ClickedResetAfterDelay` returns `$.run(DelayReset.make({}))` without running side effects in `update`. The runtime executes the Command and feeds `CompletedDelayReset` back into `update` to zero the count. While it runs, `h.isRunning(DelayReset)` is `true`, so the button shows \"Resetting\". In Foldkit 0.x, that same handler returned `{ model, commands: [DelayReset] }`."
        ),
        P(
          h,
          "`subscriptions` returns keyed Subscription declarations derived from the Model, and the runtime starts and stops each Stream for you. When `isAutoCounting` is `true`, `tick` enters the list and emits `Ticked` every second; when it flips to `false`, `tick` drops out and the runtime tears down the Stream. A plain `&&` replaces Foldkit 0.x's `modelToDependencies` and `dependenciesToStream` wiring."
        )
      ),
      h.section.attr("aria-labelledby", "split").children(
        h.h2.id("split").children("Split large components without manual type annotations"),
        P(
          h,
          "Once a component outgrows a single chained call, assign `Component.define(...)` to a variable and write each piece separately before calling `.make`. Because the definition carries the types for `$`, `h`, and every Message, extracted handlers, views, and fragments stay typed on their own (while `init` and `subscriptions` take an explicit `Model` annotation)."
        ),
        Listing(h, h.props.snippets.split),
        P(
          h,
          "`CounterDef.update(\"ClickedResetAfterDelay\", ...)` types a handler for one Message. Calling `CounterDef.update(...)` with no tag creates a shared handler that works across multiple Messages, such as `increment` serving both `ClickedIncrement` and `Ticked`."
        ),
        P(
          h,
          "The definition provides typed helpers for `update`, `view`, and `fragment`. `init` and `subscriptions` are ordinary functions typed with `Model`. Keep small components inline, and pull pieces out once a file grows."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("Why Foldkit 0.x's single root Model hits a scaling wall"),
        P(
          h,
          "Foldkit 0.x's single-Model architecture works well when an app is small. One Model holds all state, one Message union covers every event, and one `update` function processes every transition in a single place."
        ),
        P(
          h,
          "To reuse a widget like a Counter, you extract a Submodel with its own Model, Message, `update`, and `view`. At runtime, though, a Submodel has no state of its own. The parent has to store the Submodel's Model as a field, wrap its Messages in a parent Message, unwrap them in `update`, forward them to the Submodel's `update`, and write the returned Model back."
        ),
        P(
          h,
          "Across a real application, parent modules turn into message routers for every child on the page, even when the parent has no reason to care what those children are doing."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children(
          "Each component instance stores its own Model and handles its own Messages"
        ),
        P(
          h,
          "An Effect UI app is a tree of independent components. The runtime manages each instance's Model, Message union, and `update`. When a user clicks inside a child, the runtime delivers that Message straight to the child's `update`, so the parent never stores child state or forwards child events."
        ),
        P(
          h,
          "Compare a page with a Counter and a toggle button in both versions. The diagram traces a single click on `+`."
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
              title: "Effect UI: Page renders Counter directly",
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
          "Both `Counter` files implement the same Model, Messages, and increment/decrement logic (with Effect UI's tagged handlers and chained HTML syntax). The structural change is in `Page`: the `counter` field on the parent Model, the `GotCounterMessage` wrapper, and `foldCounter` are gone, and `h.submodel` becomes a direct `Counter(h, {})` call. The page's `update` only handles `ClickedToggleCounter`."
        ),
        P(
          h,
          "Splitting state across instances keeps the same observability you had with one root Model. Every Message still passes through an `update`, and `MessageLog` records each step under the component instance's path."
        )
      ),
      h.section.attr("aria-labelledby", "lifetime").children(
        h.h2.id("lifetime").children("State unmounts with the component unless you opt into scoped lifetime"),
        P(
          h,
          "If you hid and showed both counters above, you saw the behavioral shift right away: Foldkit 0.x kept the count, while Effect UI reset it to 0."
        ),
        P(
          h,
          "In Foldkit 0.x, a Submodel's state lives on its parent's Model until the parent replaces it. Flipping `isCounterShown` left `counter` untouched, so the count survived by default. Clearing it meant remembering to re-initialize `counter` inside the parent's `update`."
        ),
        P(
          h,
          "In Effect UI, a component's state follows its mount lifecycle. When `isCounterShown` turns `false`, the parent stops rendering `Counter`, and the runtime unmounts the instance and discards its Model. Showing it again mounts a fresh instance at 0."
        ),
        P(
          h,
          "Some state needs to outlive being hidden, like a draft inside a tab the user switched away from. For those cases, set `scoped: true` on the component and render it through `h.scoped`. When the view stops rendering the component, its DOM nodes leave the page, while its Model, Subscriptions, and in-flight Commands stay alive until the parent unmounts or a predicate passed to `h.scoped` returns `false`."
        ),
        h.figure.class("kept").children(
          ...h.props.snippets.kept.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet))),
          h.figcaption.class("caption").children(
            ...Text(h, "Two lines change, and the Effect UI Counter keeps its count while hidden.")
          )
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("Scope Effect services to the components that need them"),
        P(
          h,
          "Take an editor that saves drafts through a `Drafts` service."
        ),
        P(
          h,
          "In Foldkit 0.x, sharing one `Drafts` instance across Commands means passing `Drafts.layer` to `makeApplication` in `resources`. The runtime builds that Layer the first time any Command or Subscription runs (even an unrelated one), keeps it alive for the entire app, and exposes it to every Command."
        ),
        P(
          h,
          "Leave `Drafts.layer` out of `resources` and the app still compiles, then crashes at runtime with \"Service not found: Drafts\" on the first save. Providing `Drafts` inside the Command's own Effect avoids the crash, at the cost of rebuilding the service on every run."
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
            "Foldkit 0.x configures `Drafts` globally at the root. Effect UI scopes it to `Editor` where the component is defined."
        }),
        P(
          h,
          "`Component.provide` works like `Effect.provide` for a component and its subtree. Because `Editor` exports itself with its Layers attached, any page can render `Editor(h, {})` without wiring up dependencies."
        ),
        P(
          h,
          "If a page renders two Editors, each keeps its own text while sharing one `Drafts` instance. The runtime builds `Drafts` when the first Editor mounts and releases it when the last one unmounts, so removing one Editor discards its text without disrupting the other."
        ),
        P(
          h,
          "Exporting `EditorNoDeps` alongside `Editor` keeps dependencies checked at compile time and easy to stub in tests. Mounting `EditorNoDeps` leaves the `SaveDraft` requirement in the type system, so TypeScript blocks running the app until something provides it, and a test can supply a fake `SaveDraft` Layer."
        )
      ),
      h.section.attr("aria-labelledby", "lazy").children(
        h.h2.id("lazy").children("Load component code on demand without up-front imports"),
        P(
          h,
          "Because a Foldkit 0.x app composes one Model, one `update`, and one `view` up front, every page's code ships in the initial bundle. You can put a heavy dependency behind `import()` or embed a separate app with its own bundle, yet you cannot split the pages of a single app."
        ),
        P(
          h,
          "In Effect UI, a parent can render a component it never imports. `Panel` below is a contract made of a name and a props Schema. `PanelLoader` renders whatever implements `Panel`, receiving that implementation from a Layer that awaits `import()`."
        ),
        Beside(h, {
          label: "A panel loaded on demand",
          files: h.props.snippets.lazy,
          demo: PanelPage(h, {}),
          caption:
            "Open your browser's Network tab, then click Show panel. The request for `CounterPanel` fires on that click."
        }),
        P(
          h,
          "What loads over the wire is a complete component: `CounterPanel`'s Model, Messages, `update`, and `view`. The runtime renders `fallback` while the Layer builds, then mounts `CounterPanel` in its place. `import()` gives the bundler a split point, and `Component.provide` is the same mechanism `Editor` used for `Drafts`."
        ),
        P(
          h,
          "Because the runtime builds a Layer when its providing component mounts, the Layer sits on `PanelLoader`, which the page only renders once you ask for the panel. Putting it on the page itself would load it with the page. If the import fails, `PanelLoader` fails and the page renders the `fallback` you passed."
        )
      ),
      h.section.attr("aria-labelledby", "failure").children(
        h.h2.id("failure").children("Contain component crashes without taking down the page"),
        P(
          h,
          "In Foldkit 0.x, an uncaught error from `update`, `view`, or a Command halts the application. The runtime switches to the crash view, and no further Messages run."
        ),
        P(
          h,
          "In Effect UI, a failure stops at the component where it occurred. Below, `Widget`'s `update` throws on click. The page passes a `fallback` to `Widget`, and the runtime swaps it in when `Widget` fails."
        ),
        Beside(h, {
          label: "A widget that fails beside a counter that keeps working",
          files: h.props.snippets.failure,
          demo: WidgetPage(h, {}),
          caption: "Click Break the widget, then keep counting."
        }),
        P(
          h,
          "The sibling counter owns its own Model, so it keeps its count and responds to clicks. A failed component stays in its fallback until its `key` changes. Clicking \"Restart the widget\" sends the page a Message that changes the key, prompting the runtime to mount a fresh `Widget`."
        )
      ),
      h.section.attr("aria-labelledby", "noop").children(
        h.h2.id("noop").children("Skip dummy Messages for fire-and-forget Commands"),
        P(
          h,
          "Foldkit 0.x requires every Command to return a Message, even when `update` has nothing to do with the result. Saving a draft leaves the editor's Model unchanged, so the Foldkit 0.x version still declares `SavedDraft` and writes a no-op handler that returns the Model as is."
        ),
        Compare(h, {
          foldkit: {
            title: "Foldkit 0.x: declares SavedDraft only to ignore it",
            files: h.props.snippets.noopFoldkit
          },
          effect: {
            title: "Effect UI: pipes SaveDraft through Command.asNoop",
            files: h.props.snippets.noopEffect
          }
        }),
        P(
          h,
          "With `Command.asNoop`, the runtime still runs `SaveDraft`, then maps its result to `Component.noop` so no follow-up Message reaches `update`. The Effect UI Editor drops from two Messages to one."
        ),
        P(
          h,
          "Use `Command.asNoop` only when `update` ignores the outcome. In the counter above, `CompletedDelayReset` is what sets `count` back to 0. Piping `DelayReset` through `Command.asNoop` would still compile, wait one second, and leave the count untouched."
        )
      ),
      h.section.attr("aria-labelledby", "headless").children(
        h.h2.id("headless").children("Reuse component behavior across different markup"),
        P(
          h,
          "Swap `view` for `parts` and a component becomes headless. It keeps its Model, `update`, Commands, and Subscriptions, while the caller controls all markup and styling. Below, one headless `Counter` drives two separate UIs: a compact inline counter and a scoreboard with auto-count."
        ),
        Beside(h, {
          label: "Two UIs built from the headless Counter",
          files: h.props.snippets.headless,
          demo: Scoreboard(h, {}),
          caption: "Both counters are live and keep independent counts."
        }),
        P(
          h,
          "The parent supplies the elements, classes, and labels. Calling `counter.increment(h.button)` binds the component's click handler to the parent's button, so clicks flow directly into `Counter`'s `update`. Each keyed placement (`compact` and `scoreboard`) is a separate instance with its own count."
        ),
        P(
          h,
          "This is the same pattern `@effect/ui-kit` uses for unstyled primitives like `Select` and `Collapsible`."
        )
      ),
      h.section.attr("aria-labelledby", "fragment").children(
        h.h2.id("fragment").children("Extract view helpers with typed Message dispatch"),
        P(
          h,
          "When part of a view gets repetitive, you do not always want a separate component with its own state. Below, the counter's delayed-reset button lives in a fragment that disables itself and shows \"Resetting\" while `DelayReset` is running."
        ),
        Beside(h, {
          label: "Counter with a reset fragment",
          files: h.props.snippets.fragment,
          demo: FragmentCounter(h, { key: "fragment" }),
          caption: "Click Reset in 1 second. The button disables itself until the reset finishes."
        }),
        P(
          h,
          "`CounterDef.fragment` passes the function the same typed `h` that `view` receives, followed by any extra arguments you want. The helper can dispatch the component's Messages and call `h.isRunning` without manual type annotations."
        )
      ),
      h.section.attr("aria-labelledby", "testing").children(
        h.h2.id("testing").children("Test pure updates with Story and Scene, or run real Effects with Play"),
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
          "`Story` tests `update` by sending Messages and inspecting the Model. `Scene` drives interactions through the rendered view. In both, Commands remain pending as data until the test resolves them by name, and an unresolved Command fails the test."
        ),
        P(
          h,
          "Compared to Foldkit 0.x, three things got cleaner: you pass the component directly instead of `update` (or `update` and `view`), tests start from `init` rather than a hand-built Model, and steps run on a cursor so you can assert against `s.model` between steps with ordinary assertions."
        ),
        Listing(
          h,
          h.props.snippets.play,
          "Play is new in Effect UI. It runs real Commands, Subscriptions, and child components."
        ),
        P(
          h,
          "Because `Story` and `Scene` resolve `DelayReset` by hand, they pass no matter what `DelayReset` does at runtime. `Play` runs the real Command against `TestClock`, verifying that the count stays at 1 at 999ms and resets to 0 at 1 second."
        ),
        P(
          h,
          "The same gap shows up with Subscriptions. A `Story` can confirm that `tick` is active and dispatch a synthetic `Ticked`, whereas `Play` runs the Stream itself. If someone removed `Stream.drop(1)`, the `Story` would still pass, while `Play` catches that the count hits 4 after three seconds instead of 3."
        ),
        P(
          h,
          "`Play` also mounts real child components end to end, removing the need to test a Command's Effect in isolation with a mock Layer as Foldkit 0.x recommended."
        )
      ),
      h.section.attr("aria-labelledby", "performance").children(
        h.h2.id("performance").children(
          "Faster script time than Foldkit 0.x on seven of nine table operations"
        ),
        h.p.children(
          "We ran Effect UI and Foldkit 0.x entries through ",
          h.a.attr("href", links.harness).children("js-framework-benchmark"),
          ", a keyed table benchmark, alongside its own React, Vue, Svelte, Solid, and vanilla JS entries. Every entry renders the same table. For each operation, the harness records click-to-paint time and how much of that went to script execution."
        ),
        PerformanceChart(h),
        P(
          h,
          "The first group shows script time. Painting 1,000 rows took about 100 ms in every entry on the test machine, so script time separates the entries more clearly than total click-to-paint time. Creating 10,000 rows took Effect UI 188 ms of script against Foldkit 0.x's 398 ms, and 1,319 ms against 1,471 ms from click to paint. Foldkit 0.x spent less script time swapping two rows, at 8.6 ms against 12.5 ms. Removing a row took about 4 ms of script in both."
        ),
        P(
          h,
          "The Effect UI entry also produced a smaller bundle, an earlier first paint, and a smaller JavaScript heap after load and with 1,000 rows. Each of those four metrics was measured once per run, so treat them as rough. Svelte spent less script time than both Effect entries on all nine operations, and Solid on all except clearing rows. Vue spent less script time than Effect UI on five operations, by the widest margins on updating, selecting, and swapping rows. In Effect UI, each Message runs `update` and the whole `view`, and `h.lazy` compares the arguments of all 1,000 rows to find the few that changed. Svelte and Solid track which DOM nodes depend on which state and update only those."
        ),
        AllResults(h)
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("Fact-based Messages and pure updates stay intact"),
        P(
          h,
          "The component model changes how state is scoped, while the core Elm-style architecture stays the same. Models are still Schemas. Messages still record facts that happened, like `ClickedSave`, and `update` decides how state transitions. `init`, `update`, and `view` remain pure functions, and Commands, Subscriptions, and Mounts remain declarative values executed by the runtime."
        ),
        P(
          h,
          "Data flow remains strictly one-way. A child has no reference to its parent; instead of returning an `OutMessage`, it emits a typed event and lets the parent decide what to do with it."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("Bring your Models, Messages, and update logic over"),
        h.p.children(
          "The upgrade guide isn't published yet. Once it is, it will cover the API changes step by step. Your Models, Messages, and update logic move over with minor changes, and most of the diff is deleting parent forwarding boilerplate. Follow Effect UI development ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("on GitHub"),
          "."
        )
      ),
      h.footer.class("footer").children(
        P(h, "This page is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.")
      )
    )
})
