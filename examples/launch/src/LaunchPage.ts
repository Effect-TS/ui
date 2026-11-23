import { Code } from "#components/Code"
import { Diagram } from "#components/Diagram"
import { Pair, Snippet } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Page } from "./counter/effect/Page.ts"
import { EmbedFoldkitPage } from "./counter/FoldkitEmbed.ts"

const Example = <M>(h: View.H<M>, options: {
  readonly title: string
  readonly files: ReadonlyArray<Snippet>
  readonly demo?: View.Content<M>
}) =>
  h.section.class("example").attr("aria-label", options.title).children(
    h.h3.class("example-title").children(options.title),
    options.demo && h.div.class("demo").children(options.demo),
    ...options.files.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet)))
  )

const Text = <M>(h: View.H<M>, text: string) =>
  text.split("`").map((part, index) => index % 2 === 0 ? part : h.code.children(part))

const P = <M>(h: View.H<M>, text: string) => h.p.children(...Text(h, text))

export const LaunchPage = Component.define({
  name: "LaunchPage",
  scoped: false,
  props: Schema.Struct({ counter: Pair, kept: Schema.Array(Snippet), provider: Pair }),
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  head: () => [Head.title("Foldkit's frontend continues as Effect UI")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Foldkit's frontend continues as Effect UI"),
        P(
          h,
          "Foldkit 0.x is the frontend framework published on npm as `foldkit`. Its frontend work continues as Effect UI, which you import from `effect/ui`. Foldkit becomes the full-stack framework built on Effect UI."
        ),
        P(h, "This page shows what is changing and why. It assumes you've built something with Foldkit 0.x.")
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("One Model in Foldkit 0.x"),
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
        h.h2.id("components").children("Components in Effect UI"),
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
              title: "Foldkit 0.x",
              files: h.props.counter.foldkit,
              demo: h.div.class("embed").onMount(EmbedFoldkitPage())
            }),
            Example(h, { title: "Effect UI", files: h.props.counter.effect, demo: Page(h, {}) })
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
        h.h2.id("lifetime").children("How long state lasts"),
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
          ...h.props.kept.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet))),
          h.figcaption.class("caption").children(
            ...Text(h, "With these two lines changed, the Counter above keeps its count while it's hidden.")
          )
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("Services"),
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
        h.figure.class("compare wide").children(
          h.div.class("compare-columns").children(
            Example(h, { title: "Foldkit 0.x", files: h.props.provider.foldkit }),
            Example(h, { title: "Effect UI", files: h.props.provider.effect })
          ),
          h.figcaption.class("caption").children(
            ...Text(
              h,
              "Foldkit 0.x provides `Drafts` at the root, to every Command. Effect UI provides it on `Editor`, in the editor's own file."
            )
          )
        ),
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
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("What carries over"),
        P(
          h,
          "A Model is still a Schema. A Message still records something that happened, like `ClickedSave`, and update decides what to do about it. init, update and view are still pure functions. Commands, Subscriptions and Mounts keep their names, and they are still values the runtime performs."
        ),
        P(
          h,
          "A child still knows nothing about its parent. Where a Submodel returned an OutMessage, a component emits an event, and the parent decides what the event means."
        ),
        P(h, "A test still performs no effects. Each Command is a value the test resolves by name.")
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("Upgrading from Foldkit 0.x"),
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
