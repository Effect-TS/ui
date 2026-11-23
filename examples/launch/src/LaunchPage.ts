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
  head: () => [Head.title("Foldkit 0.x continues as Effect UI")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Foldkit 0.x continues as Effect UI"),
        h.p.children(
          "We have paused feature work on Foldkit 0.x and moved that work to Effect UI, the library that ",
          h.a.attr("href", "https://foldkit.dev/blog/foldkit-joins-effect").children("Foldkit Joins Effect"),
          ...Text(
            h,
            " called the new frontend foundation. You import it from `effect/ui`, and Foldkit itself becomes the full-stack framework built on top of it."
          )
        ),
        P(
          h,
          "If you have an app on Foldkit 0.x, most of what you know stays. You still write Models, Messages and update, and your app will be migrated, not rewritten, although some of the API changes are substantial. Foldkit 0.x keeps getting critical bug fixes at least until Effect UI ships with an upgrade guide."
        ),
        P(
          h,
          "This page shows what is changing and why. It assumes you've built something with Foldkit 0.x, and most of the examples are live so you can try each difference yourself."
        )
      ),
      h.section.attr("aria-labelledby", "define").children(
        h.h2.id("define").children("An Effect UI component is made of the pieces you already write"),
        P(
          h,
          "We'll start with what a component looks like. Here is a counter with a delayed reset and an auto-count, and if you can read a Foldkit 0.x module, you can read it."
        ),
        Beside(h, {
          label: "Live auto-counter",
          files: h.props.snippets.intro,
          demo: Counter(h, { key: "intro" }),
          caption: "Click \"Increment\", then turn \"Auto-count\" on and off."
        }),
        P(
          h,
          "It has a Model, Messages, an update and a view, and each does the job it does in Foldkit 0.x. Some names and the view syntax are different, but only two things work differently. A handler returns a step built from `$`, where a Foldkit 0.x handler returns a Model and a list of Commands. And a Subscription is listed only while it should run, so one `&&` does the work of the two dependency functions you write in 0.x."
        ),
        P(
          h,
          "Commands work the way you expect. Click \"Reset in 1 second\" and the button reads \"Resetting\" for a second before the count returns to 0. `DelayReset` is still a Command that the runtime runs, and its result still comes back to update as a Message."
        )
      ),
      h.section.attr("aria-labelledby", "split").children(
        h.h2.id("split").children("You can still write init, update and view as separate functions"),
        P(
          h,
          "That counter is written in one call, but it doesn't have to be. A Foldkit 0.x module exports its init, update and view one by one, and you can keep that shape here:"
        ),
        Listing(h, h.props.snippets.split, "The counter from the first example, written as separate functions."),
        P(
          h,
          "What differs is where the types come from. In Foldkit 0.x you annotate each function with its Model and Message types yourself, while here `CounterDef.update` and `CounterDef.view` take them from the definition. Only init and subscriptions name `Model`, because they are plain functions."
        ),
        P(
          h,
          "So far the differences are small. The change that affects how you structure an app is where the Model lives. To explain it, we need to start with Foldkit 0.x."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("In Foldkit 0.x, the entire application state is a single Model"),
        P(
          h,
          "One Model gives you one place to look. Every change to it goes through one update, which is why DevTools can show you every Message in the order it happened. We still think that was the right way to start."
        ),
        P(
          h,
          "The cost shows up when you add a Submodel. A Submodel defines a Model but has nowhere to keep one, so the parent stores it in a field of its own Model. The parent also wraps each of the child's Messages in one of its own and passes it on to the child's update."
        ),
        P(
          h,
          "That wiring is by design, since it is how every Message reaches the root update. But you write it again for every child of every parent, even when the parent has no use for what it forwards. In the next example, Page holds a count only to hand it back to Counter."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children("In Effect UI, each component has its own Model, Messages and update"),
        P(
          h,
          "In Effect UI we moved that wiring into the runtime. The runtime stores a Model for each component instance and delivers each Message to the instance that sent it. All the parent writes is one call in its view."
        ),
        P(
          h,
          "To see what that removes, take a page with a counter and a button that hides it. Here is one click on + traced through each version:"
        ),
        Diagram(h, "One click on + in each version. The numbers give the order of the steps."),
        P(
          h,
          "In Foldkit 0.x the click takes five steps, and three of them happen in Page. In Effect UI it takes three, and Page is not involved in any of them. Here is the code behind both versions, with each page running under its source:"
        ),
        h.figure.class("compare wide").children(
          h.div.class("compare-columns").children(
            Example(h, {
              title: "Foldkit 0.x: Page stores and forwards for Counter",
              files: h.props.snippets.counterFoldkit,
              demo: h.div.class("embed").onMount(EmbedFoldkitPage())
            }),
            Example(h, {
              title: "Effect UI: Page renders Counter",
              files: h.props.snippets.counterEffect,
              demo: Page(h, {})
            })
          ),
          Caption(h, "Both pages are live. Click \"+\" in each, then \"Hide counter\", then \"Show counter\".")
        ),
        P(
          h,
          "Counter has the same Model and the same two Messages in both columns, so the difference is all in Page. The Effect UI Page drops the `counter` field from its Model, along with `GotCounterMessage`, `foldCounter` and `h.submodel`."
        ),
        P(
          h,
          "Foldkit 0.x steered you away from per-component state, and with good reason, so it is worth being exact about what a component has here. Its state is its Model, only its own update can change that Model, and every Message still goes through an update. What changed is who stores a child's Model and who delivers its Messages. In Foldkit 0.x the parent does both, and in Effect UI the runtime does."
        ),
        P(
          h,
          "You do give something up. There is no longer one value that holds the whole app, because the state is now a tree of Models, one per component instance. If you provide a `MessageLog`, the runtime still records every update in order, under the path of the instance that handled it."
        )
      ),
      h.section.attr("aria-labelledby", "lifetime").children(
        h.h2.id("lifetime").children("A hidden component loses its Model unless you mark it scoped"),
        P(
          h,
          "Giving each component its own Model also changes how long that Model lives. If you hid and showed the two counters above, the count came back in Foldkit 0.x and started again at 0 in Effect UI. Of everything on this page, that is the change most likely to surprise you."
        ),
        P(
          h,
          "In Foldkit 0.x the count lives in Page's Model, so hiding the view doesn't touch it. That is a real advantage, because a draft or an inactive tab keeps its state without you writing anything."
        ),
        P(
          h,
          "In Effect UI we chose the other default. A component's Model lasts as long as its parent's view renders it. When Page stops rendering Counter, the runtime discards Counter's Model, and showing Counter again runs init again."
        ),
        P(h, "When you want the Foldkit 0.x behavior you ask for it, and it takes two lines:"),
        h.figure.class("kept").children(
          ...Files(h, h.props.snippets.kept),
          Caption(h, "With these two lines, the Effect UI counter keeps its count while hidden.")
        ),
        P(
          h,
          "`scoped: true` goes on the definition, and `h.scoped` goes around the call in Page's view. While the counter is hidden, the runtime keeps its Model, its Subscriptions and any Commands in flight. It discards them when Page itself is removed."
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("Each component provides the services its own Commands need"),
        P(
          h,
          "A component that holds its own Model can also bring its own services. Take an editor that saves its text through a `Drafts` service. In Foldkit 0.x its Layer goes in `resources` at the root of the app, where the runtime builds it once for every Command to share."
        ),
        P(
          h,
          "That means the root has to know what every Command in the app needs, and TypeScript doesn't check that it does. Remove the `resources` line from the app below and it still compiles, but the first save fails with \"Service not found: Drafts\"."
        ),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x: the app root provides Drafts", files: h.props.snippets.providerFoldkit },
          effect: { title: "Effect UI: Editor provides Drafts itself", files: h.props.snippets.providerEffect },
          caption: "The Command does the same work on both sides. `Drafts.layer` is provided in a different place."
        }),
        P(
          h,
          "In Effect UI the Layers travel with the component. `Editor` is `EditorNoDeps` with its two Layers provided, so a page can render it without knowing that `Drafts` exists. And if you leave a Layer off, TypeScript stops you. Mounting `EditorNoDeps` on its own leaves `SaveDraft` in the app's requirements, and the app doesn't compile."
        )
      ),
      h.section.attr("aria-labelledby", "lazy").children(
        h.h2.id("lazy").children("Code for a component can load the first time it is shown"),
        P(
          h,
          "The same independence lets a component's code arrive late. A Foldkit 0.x app composes one Model, one update and one view before it starts, so the code for every page ships in the first bundle. The 0.x docs say that splitting by route would take design work against the single Model. A component that carries its own Model, update and services has no such tie to the root."
        ),
        Beside(h, {
          label: "Panel loaded on demand",
          files: h.props.snippets.lazy,
          demo: PanelPage(h, {}),
          caption:
            "Open the Network tab, then click \"Show panel\". The request for `CounterPanel` is made on that click."
        }),
        P(
          h,
          "You see \"Loading the panel\" and then a counter with a \"+\" button. What arrived is a whole component with its own Model and update, and until that click the page had loaded none of its code."
        ),
        P(
          h,
          "The page knows only `Panel`, which is a contract it can render. The implementation comes from a Layer that awaits `import()`, and the runtime builds that Layer when `PanelLoader` mounts."
        )
      ),
      h.section.attr("aria-labelledby", "failure").children(
        h.h2.id("failure").children("One failed component leaves the rest of the page running"),
        P(
          h,
          "A component is also a place for an error to stop. In Foldkit 0.x, an error that escapes update, view or a Command stops the application. The runtime renders the crash view and no later Message runs. With one Model and one update there is nothing smaller to stop. In Effect UI the smaller thing is a component."
        ),
        Beside(h, {
          label: "Failing widget beside a counter",
          files: h.props.snippets.failure,
          demo: WidgetPage(h, {}),
          caption: "Click \"+\" a few times, then \"Break the widget\", then keep counting."
        }),
        P(
          h,
          "The counter keeps counting, and the widget is replaced by the text \"The widget failed.\" That works because every child is a failure boundary. A child that throws shows the `fallback` its parent passed while its siblings keep running. \"Restart the widget\" changes the widget's `key`, which makes the runtime mount a new instance."
        )
      ),
      h.section.attr("aria-labelledby", "noop").children(
        h.h2.id("noop").children("A Command no longer needs a Message when update ignores the result"),
        P(
          h,
          "The remaining changes are smaller, and the first concerns Commands whose result you don't use. Foldkit 0.x requires every Command to return a Message. When the work changes nothing in the Model, you still declare a result Message and handle it by returning the Model unchanged. That Message is how DevTools and your tests know the Command finished."
        ),
        P(h, "Saving a draft is that kind of Command:"),
        Compare(h, {
          foldkit: {
            title: "Foldkit 0.x: SavedDraft records that the save finished",
            files: h.props.snippets.noopFoldkit
          },
          effect: { title: "Effect UI: SaveDraft is piped through Command.asNoop", files: h.props.snippets.noopEffect },
          caption: "The Foldkit 0.x editor declares two Messages. The Effect UI editor declares one."
        }),
        P(
          h,
          "With `Command.asNoop` the Command still runs, but update receives no Message when it ends, so the Effect UI editor has no `SavedDraft` to declare or handle. If you provide a `MessageLog`, it still records that the Command was issued and that it ended."
        ),
        P(
          h,
          "What you give up is the result. Pipe the first counter's `DelayReset` through `Command.asNoop` and the code still compiles. After one second the count stays where it was, because update never hears that the delay completed."
        )
      ),
      h.section.attr("aria-labelledby", "headless").children(
        h.h2.id("headless").children("Headless components keep their behavior and let the caller draw them"),
        P(
          h,
          "Reusable UI components change the way the counter page did. In Foldkit 0.x a component such as a Listbox is a Submodel, so its Model is a field in yours and its Messages need a wrapper. A headless Effect UI component holds its own Model and leaves only the markup to the caller."
        ),
        P(h, "The Counter below has `parts` where the earlier ones have a view, and two callers draw it differently:"),
        Beside(h, {
          label: "Two drawings of one Counter",
          files: h.props.snippets.headless,
          demo: Scoreboard(h, {}),
          caption: "Click \"+\" in the compact counter, then \"Add a point\" and \"Auto-count\" in the scoreboard."
        }),
        P(
          h,
          "The two counts move separately because each `key` is a separate instance with its own Model. Neither caller handles a Message, since `counter.increment(h.button)` attaches Counter's click handling to whatever button the caller draws."
        )
      ),
      h.section.attr("aria-labelledby", "fragment").children(
        h.h2.id("fragment").children("A fragment is a typed view function without its own Model"),
        P(
          h,
          "A piece of a view doesn't always need to be a component. The Foldkit 0.x docs say that a section which only renders its parent's state should be a view function, and that advice carries over. In Effect UI such a function is called a fragment:"
        ),
        Beside(h, {
          label: "Counter with a reset fragment",
          files: h.props.snippets.fragment,
          demo: FragmentCounter(h, { key: "fragment" }),
          caption: "Click \"Reset in 1 second\" twice. The second click does nothing while the reset runs."
        }),
        P(
          h,
          "`resetButton` takes the builder and a label, and `CounterDef.fragment` types the builder for it, where a 0.x helper declares that type by hand. The button sends the component's own Message and disables itself while `DelayReset` runs."
        )
      ),
      h.section.attr("aria-labelledby", "testing").children(
        h.h2.id("testing").children("Story and Scene carry over, and Play runs the real Commands"),
        P(
          h,
          "Your tests keep their shape. Story and Scene exist in both frameworks, and here is the same delayed reset tested in each:"
        ),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Story: update and a given Model", files: h.props.snippets.storyFoldkit },
          effect: { title: "Effect UI Story: the component itself", files: h.props.snippets.storyEffect }
        }),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Scene: update, view and a given Model", files: h.props.snippets.sceneFoldkit },
          effect: { title: "Effect UI Scene: the component itself", files: h.props.snippets.sceneEffect }
        }),
        P(
          h,
          "All four tests expect `DelayReset` and resolve it by hand with `CompletedDelayReset`. What differs is the starting point. A Foldkit 0.x test takes update, or update and view, and a Model you give it. An Effect UI test takes the component and starts from its init."
        ),
        P(
          h,
          "A Command you resolve by hand never runs, though, so those four tests pass whatever `DelayReset` does. Play is new in Effect UI, and it runs the real Command:"
        ),
        Listing(
          h,
          h.props.snippets.play,
          "Play runs the real `DelayReset` against a test clock. The count is 1 at 999 ms and 0 at one second."
        ),
        P(
          h,
          "In Foldkit 0.x you test a Command's Effect separately, with a mock Layer. Play covers both in one test. It mounts the component, clicks its buttons and moves time with `TestClock`, and Subscriptions run under it too."
        )
      ),
      h.section.attr("aria-labelledby", "performance").children(
        h.h2.id("performance").children(
          "Effect UI spends less script time than Foldkit 0.x on seven of nine operations"
        ),
        h.p.children(
          "The last thing to compare is speed. We ran Effect UI and Foldkit 0.x through ",
          h.a.attr("href", links.harness).children("js-framework-benchmark"),
          ", a keyed table benchmark, with five other entries beside them on the same machine."
        ),
        PerformanceChart(h),
        P(
          h,
          "The first group of rows is median script time. Effect UI spent less on seven of the nine operations, and the widest gap was creating 10,000 rows, at 188 ms against 398 ms. Foldkit 0.x spent less on the other two. Swapping two rows took it 8.6 ms against 12.5 ms, and removing a row took 4.2 ms against 4.3 ms."
        ),
        P(
          h,
          "Neither is the fastest entry. Svelte spent less script time than both on all nine operations, and Vue spent less than Effect UI on five. These are also table operations on one machine, so they don't tell you how a whole application performs."
        ),
        AllResults(h)
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("Messages are still facts, and every change still goes through update"),
        P(
          h,
          "The Foldkit 0.x roadmap says the architecture is locked, meaning that the Model is the source of truth and every change after init passes through update. Both still hold in Effect UI, with the one difference this page has been about. \"The Model\" is now one Model per component."
        ),
        P(
          h,
          "The rest carries over as you know it. Messages are still facts about what happened, and Commands, Subscriptions and Mounts are still values the runtime runs. Data still flows one way, and a child has no reference to its parent. Where a 0.x Submodel returns an OutMessage, an Effect UI component emits a typed event with `$.emit`, and the parent decides what it means."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("The upgrade guide is not published, and Effect UI is still experimental"),
        h.p.children(
          "Effect UI is experimental today, and the upgrade guide is not published and has no date. Until it ships, Foldkit 0.x keeps getting critical bug fixes and you can keep building on it. The work happens in ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("Effect-TS/ui"),
          ". If a pattern in your app has no place in what you saw here, open an issue there and tell us."
        )
      ),
      h.footer.class("footer").children(
        P(h, "This page is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.")
      )
    )
})
