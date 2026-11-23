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
  head: () => [Head.title("Effect UI is the successor to Foldkit 0.x’s frontend")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Effect UI is the successor to Foldkit 0.x’s frontend"),
        P(
          h,
          "Foldkit 0.x is the frontend framework published on npm as `foldkit`. Its frontend work continues as Effect UI, which you import from `effect/ui`. Foldkit becomes the full-stack framework built on Effect UI."
        ),
        P(h, "This page shows what is changing and why. It assumes you've built something with Foldkit 0.x.")
      ),
      h.section.attr("aria-labelledby", "define").children(
        h.h2.id("define").children(
          "In Effect UI, a component declares its Model and Messages, then defines init, update and view"
        ),
        P(
          h,
          "Here is a counter written as one file. It counts up when you click, resets one second after you ask it to, and counts by itself while auto-count is on."
        ),
        Beside(h, {
          label: "Counter",
          files: h.props.snippets.intro,
          demo: Counter(h, { key: "intro" }),
          caption: "The counter is running. Click Reset in 1 second, or click Auto-count and then Stop."
        }),
        P(
          h,
          "`Component.define` takes the name and the Schemas, and `make` takes init, update and view. update is a record with one handler per Message."
        ),
        P(
          h,
          "A Command is one request with one result. The `ClickedResetAfterDelay` handler returns `$.run(DelayReset.make({}))` and starts nothing itself. The runtime sleeps for one second and sends `CompletedDelayReset`, and that handler sets the count to zero. While the Command runs, `h.isRunning(DelayReset)` is true and the button reads Resetting. In Foldkit 0.x the same handler returned `{ model, commands: [DelayReset] }`."
        ),
        P(
          h,
          "A Subscription runs for as long as the Model asks for it. `subscriptions` is a function of the Model that lists the Streams that should be running. While `isAutoCounting` is true the list contains `tick`, and each tick sends `Ticked`. When it becomes false the entry is gone and the runtime stops the Stream. No handler starts or stops a timer. In Foldkit 0.x the entry declared a dependency Schema with `modelToDependencies` and `dependenciesToStream`. Here the condition is an ordinary `&&`."
        )
      ),
      h.section.attr("aria-labelledby", "split").children(
        h.h2.id("split").children(
          ...Text(h, "Separating the definition from `make` lets you write init, update and view on their own")
        ),
        P(
          h,
          "This is the same counter with the same behaviour, and the two calls pulled apart. The definition types each piece, so none of them needs a type annotation for `$`, `h` or the Message."
        ),
        Listing(h, h.props.snippets.split),
        P(
          h,
          "`CounterDef.update(\"ClickedResetAfterDelay\", ...)` writes the handler for one Message away from the component. `CounterDef.update(...)` without a tag writes one that works for any Message, so `increment` serves both `ClickedIncrement` and `Ticked`."
        ),
        P(
          h,
          "The definition has helpers for update, view and fragment, but none for init or subscriptions. Those two are plain functions annotated with the Model type, as `init` is above. A component that fits in one piece should keep the two calls chained, and split them when it grows."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("In Foldkit 0.x, the entire application state was a single Model"),
        P(
          h,
          "A Foldkit 0.x app has one Model, one Message union and one update function. Everything the app knows is in that Model, and every Message goes through that update."
        ),
        P(
          h,
          "You can split an app into Submodels. A Submodel is a module with its own Model, Message, update and view, so you can write a Counter once and use it wherever you need one. What a Submodel doesn't have is its own state. The parent's Model stores the Submodel's Model. The Submodel's Messages reach the parent's update wrapped in one of the parent's Messages, and the parent passes each one to the Submodel's update and stores the Model that comes back."
        ),
        P(
          h,
          "The parent does that for every Submodel, including the ones whose Messages it has no decision to make about."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children(
          "In Effect UI, each component instance has its own Model and handles its own Messages"
        ),
        P(
          h,
          "An Effect UI app is a tree of components. Each component has its own Model, Message and update, and you build a page by composing them. The runtime keeps a Model for each component instance and passes each Message to the update of the instance it came from. A parent doesn't store a child's Model or route its Messages."
        ),
        P(
          h,
          "Here is a page with one Counter and a button that hides it, written both ways. The diagram follows one click on +."
        ),
        Diagram(h, "One click on + in each version. The numbers mark what runs, in order."),
        h.figure.class("compare wide").children(
          h.div.class("compare-columns").children(
            Example(h, {
              title: "The Foldkit 0.x page stores the count in its Model",
              files: h.props.snippets.counterFoldkit,
              demo: h.div.class("embed").onMount(EmbedFoldkitPage())
            }),
            Example(h, {
              title: "The Effect UI page renders the Counter without storing its count",
              files: h.props.snippets.counterEffect,
              demo: Page(h, {})
            })
          ),
          h.figcaption.class("caption").children(
            "Both pages are running. Click + in each, then hide the Counter and show it again."
          )
        ),
        P(
          h,
          "The two Counter files have the same Model, the same two Messages and the same update logic. The pages are where the versions differ. Three things in the Foldkit 0.x page have no counterpart in the Effect UI page: the `counter` field in the Model, the `GotCounterMessage` wrapper, and `foldCounter`. `h.submodel` becomes a call to `Counter`. The Effect UI page's update handles `ClickedToggleCounter`, the one Message the page has a decision to make about."
        ),
        P(
          h,
          "Every Message still goes through an update, and the MessageLog records each update under the path of the instance that ran it."
        )
      ),
      h.section.attr("aria-labelledby", "lifetime").children(
        h.h2.id("lifetime").children("In Effect UI, removing a component discards its Model by default"),
        P(
          h,
          "If you hid and showed the two Counters above, the count came back in Foldkit 0.x and started again at 0 in Effect UI."
        ),
        P(
          h,
          "In Foldkit 0.x, a Submodel's Model lasts until the parent's update replaces it. `ClickedToggleCounter` changes `isCounterShown` and leaves `counter` as it was, so the count is still there when the Counter is shown again. To start the Counter over, the page's update would have to write a new `counter`."
        ),
        P(
          h,
          "In Effect UI, a component's Model lasts as long as the component does, and the component lasts as long as its parent's view keeps writing it. While `isCounterShown` is false the view doesn't write the Counter, so the runtime ends it and its Model is gone. Showing it again starts a new Counter at 0."
        ),
        P(
          h,
          "Some state should outlast the view that shows it, like a half-filled form on a tab the user has switched away from. Define that component with `scoped: true` and write it inside `h.scoped`. When the view stops writing it, its nodes leave the document and its Model stays, along with its Subscriptions and any Commands in flight. It's kept until the component that wrote it ends, or until a predicate you pass to `h.scoped` returns false."
        ),
        h.figure.class("kept").children(
          ...h.props.snippets.kept.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet))),
          h.figcaption.class("caption").children(
            ...Text(h, "With these two lines changed, the Counter above keeps its count while it's hidden.")
          )
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("In Effect UI, a component can provide services for itself and its children"),
        P(
          h,
          "In Effect UI a component can provide the services it uses. Say an editor saves drafts through a `Drafts` service."
        ),
        P(
          h,
          "In Foldkit 0.x, the editor's Command requires `Drafts`. To share one `Drafts` between Commands, this app passes `Drafts.layer` to `makeApplication` in `resources`. The runtime builds that Layer the first time any Command or Subscription runs, whether or not it uses `Drafts`, and keeps it until the app shuts down. Every Command in the app can use it."
        ),
        P(
          h,
          "If you leave `Drafts.layer` out of `resources`, the app still compiles. It crashes with \"Service not found: Drafts\" the first time the editor saves. A Command can provide `Drafts` inside its own Effect instead, and then `Drafts` is built again every time the Command runs."
        ),
        Compare(h, {
          foldkit: {
            title: "The Foldkit 0.x app provides Drafts at the root",
            files: h.props.snippets.providerFoldkit
          },
          effect: {
            title: "The Effect UI Editor provides Drafts where the Editor is defined",
            files: h.props.snippets.providerEffect
          },
          caption:
            "Foldkit 0.x provides `Drafts` at the root, to every Command. Effect UI provides it on `Editor`, in the editor’s own file."
        }),
        P(
          h,
          "`Component.provide` is `Effect.provide` for a component and everything below it. The editor's file exports `Editor` with its Layers already provided, so a page writes `Editor` and passes nothing down."
        ),
        P(
          h,
          "With two Editors on the page, each has its own text and both use one `Drafts`. The runtime builds `Drafts` when the first Editor mounts and releases it when the last one unmounts. Removing one Editor drops that Editor's text and leaves `Drafts` in place for the other."
        ),
        P(
          h,
          "`EditorNoDeps` is the same component without its Layers. Mounting it compiles, but the mounted app then requires `SaveDraft`, and TypeScript won't let you run it until something provides one. A test can mount `EditorNoDeps` with a fake `SaveDraft`."
        )
      ),
      h.section.attr("aria-labelledby", "noop").children(
        h.h2.id("noop").children("In Effect UI, a Command whose result update ignores sends no Message"),
        P(
          h,
          "Every Foldkit 0.x Command returns a Message, even when update has no use for it. Saving a draft changes nothing in the Editor’s Model, so the Foldkit 0.x Editor declares `SavedDraft` and handles it by returning the Model it was given."
        ),
        Compare(h, {
          foldkit: {
            title: "The Foldkit 0.x Editor handles SavedDraft and changes nothing",
            files: h.props.snippets.noopFoldkit
          },
          effect: {
            title: "The Effect UI Editor runs SaveDraft with Command.asNoop",
            files: h.props.snippets.noopEffect
          }
        }),
        P(
          h,
          "`Command.asNoop` runs the Command and replaces its result with `Component.noop`, which never reaches update. The Effect UI Editor has one Message where the Foldkit 0.x Editor has two."
        ),
        P(
          h,
          "Use it only when update has nothing to do with the result. The counter’s `DelayReset` is the counter-example, because `CompletedDelayReset` is what sets the count to zero. With `Command.asNoop` it would still sleep for a second, and the count would never reset. That version type-checks, so the compiler won’t catch the mistake."
        )
      ),
      h.section.attr("aria-labelledby", "headless").children(
        h.h2.id("headless").children(
          "A headless component keeps its Model and update, and the parent draws it with parts"
        ),
        P(
          h,
          "Here is the same Counter finished with `parts` in place of `view`. It keeps its Model, update, Command and Subscription, and has no markup of its own. The page below draws it twice: a compact one with the number and a + button, and a scoreboard with a large number, Add a point and Auto-count."
        ),
        Beside(h, {
          label: "Two drawings of the headless Counter",
          files: h.props.snippets.headless,
          demo: Scoreboard(h, {}),
          caption: "Both drawings are running. Each keeps its own count."
        }),
        P(
          h,
          "The parent chooses the elements, classes and labels. `counter.increment(h.button)` puts Counter’s click handler on the parent’s button, so the click still goes through Counter’s update. Each drawing is its own instance with its own count."
        ),
        P(h, "This is how `@effect/ui-kit` components such as Select and Collapsible are written.")
      ),
      h.section.attr("aria-labelledby", "fragment").children(
        h.h2.id("fragment").children("A fragment is part of one component’s view, written as its own function"),
        P(
          h,
          "Here is the reset button from the first counter, pulled out of the view. It disables itself and reads Resetting while `DelayReset` is running."
        ),
        Beside(h, {
          label: "Counter with a reset fragment",
          files: h.props.snippets.fragment,
          demo: FragmentCounter(h, { key: "fragment" }),
          caption: "Click Reset in 1 second. The button is disabled until the count is back at 0."
        }),
        P(
          h,
          "`CounterDef.fragment` gives the function the same `h` the view gets. It can send Counter’s Messages and call `h.isRunning` with no type parameters, and it takes whatever other arguments you give it after `h`."
        )
      ),
      h.section.attr("aria-labelledby", "testing").children(
        h.h2.id("testing").children(
          "In Effect UI, Story and Scene test a component, and Play runs its Commands and Subscriptions"
        ),
        P(
          h,
          "Each test below follows one interaction: the user asks for a delayed reset, and the count goes to zero."
        ),
        Compare(h, {
          foldkit: { title: "A Foldkit 0.x Story takes update", files: h.props.snippets.storyFoldkit },
          effect: { title: "An Effect UI Story takes the component", files: h.props.snippets.storyEffect }
        }),
        Compare(h, {
          foldkit: { title: "A Foldkit 0.x Scene takes update and view", files: h.props.snippets.sceneFoldkit },
          effect: { title: "An Effect UI Scene takes the component", files: h.props.snippets.sceneEffect }
        }),
        P(
          h,
          "Story still sends Messages and reads the Model. Scene still clicks through the view and reads what it shows. In both, a Command stays pending as data until the test resolves it by name, and the test fails if one is left unresolved."
        ),
        P(
          h,
          "Three things changed. The test takes the component where Foldkit 0.x took `update`, or `update` and `view`. It starts from init, so this test clicks Increment first where the Foldkit 0.x test was given a Model with a count of 5. And the steps are calls on a cursor, so the test reads `s.model` between steps with an ordinary assertion."
        ),
        Listing(h, h.props.snippets.play, "Play has no counterpart in Foldkit 0.x."),
        P(
          h,
          "In a Story and a Scene the test hands update `CompletedDelayReset`, so both pass whatever `DelayReset` actually does. In a Play nothing is resolved. The runtime runs `DelayReset`, the test moves the clock, and the count changes at one second and not before."
        ),
        P(
          h,
          "The same holds for the Subscription. A Story can check that `tick` is listed and deliver a `Ticked` itself, but only a Play runs the Stream. With `Stream.drop(1)` removed from the counter, the Story still passes, and the Play shows 4 after three seconds where it should show 3."
        ),
        P(
          h,
          "A Play also runs child components for real, which is what this page’s hide and show test does. In Foldkit 0.x the docs tell you to test a Command’s Effect in a separate test with a mock Layer."
        )
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children(
          "Messages still describe what happened, and update still decides what changes"
        ),
        P(
          h,
          "A Model is still a Schema. A Message still records something that happened, like `ClickedSave`, and update decides what to do about it. init, update and view are still pure functions. Commands, Subscriptions and Mounts keep their names, and they are still values the runtime performs."
        ),
        P(
          h,
          "A child still knows nothing about its parent. Where a Submodel returned an OutMessage, a component emits an event, and the parent decides what the event means."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("You can reuse your Models, Messages and update logic when you migrate"),
        h.p.children(
          "The upgrade guide isn't published yet. When it is, it will go through the API changes one at a time. The Models, Messages and update logic you've written carry over with small changes, and most of what you delete is in parents. Effect UI is ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("on GitHub"),
          "."
        )
      ),
      h.footer.class("footer").children(
        P(h, "This page is an Effect UI app. Its source is `examples/launch` in Effect-TS/ui.")
      )
    )
})
