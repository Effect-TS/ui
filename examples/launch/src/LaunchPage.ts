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
        h.p.children(
          "Foldkit 0.x was a frontend framework. Its frontend work continues as Effect UI, and Foldkit becomes the full-stack framework built on it. If you've built with Foldkit 0.x, most of what you know carries over. This page shows what is changing and why."
        ),
        h.p.children(
          "Three names come up below. Foldkit 0.x is the frontend framework on npm today, foldkit@0.171. Effect UI is effect/ui, where Foldkit's frontend work continues. Foldkit is the full-stack framework, with Effect UI as its frontend."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("One Model in Foldkit 0.x"),
        h.p.children(
          "In Foldkit 0.x the whole app is one Schema Model, and every Message goes through one update. You could start at the Model, follow a Message, and see exactly what changed and why. That made apps easy to reason about and easy to test."
        ),
        h.p.children(
          "One Model meant the parent stored each child's Model. Every message the child sent was wrapped, routed through the parent's update, and unwrapped again, even when the parent had no decision to make."
        ),
        h.p.children(
          "foldkit.dev's own source has 59 Got*Message wrappers, 84 Update.foldChild* call sites and 88 h.submodel embeds. That's wiring you write and maintain, and so do your agents."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children("Components in Effect UI"),
        h.p.children(
          "In Effect UI every component instance has its own Schema Model, changed only by its own update. A parent passes props down and handles the events its children emit. It no longer stores a child's state or forwards its messages."
        ),
        Diagram(h, "One click on + in the same counter, in each version."),
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
            "Both counters are running. Click + in each, then hide the counter and show it again."
          )
        ),
        h.p.children(
          "Your Models, Messages and update functions are written the same way, and the MessageLog still records every step under the instance's path."
        )
      ),
      h.section.attr("aria-labelledby", "lifetime").children(
        h.h2.id("lifetime").children("How long a component's state lives"),
        h.p.children(
          "Stop rendering a component and its Model goes with it. That's the trade for not storing every child's state yourself. When state has to survive being off screen, like a draft on a tab the reader switched away from, the parent renders that child with ",
          h.code.children("h.scoped"),
          ", and its Model is kept while it's hidden."
        ),
        h.figure.class("kept").children(
          ...h.props.kept.map((snippet) => h.div.key(snippet.name).children(Code(h, snippet))),
          h.figcaption.class("caption").children(
            "The same Counter, defined with scoped: true and rendered inside h.scoped, keeps its count when it's hidden."
          )
        )
      ),
      h.section.attr("aria-labelledby", "services").children(
        h.h2.id("services").children("Providing services to a component"),
        h.p.children(
          "Say an editor saves drafts through a Drafts service. In Foldkit 0.x the editor's Command can ask for Drafts. To share one Drafts service across Commands, this app puts Drafts.layer in makeApplication's resources. The runtime builds that Layer the first time any Command or Subscription runs, whether or not it uses Drafts, and keeps it until the app shuts down. Leave it out and the app still compiles. It crashes with \"Service not found: Drafts\" the first time the editor saves."
        ),
        h.figure.class("compare wide").children(
          h.div.class("compare-columns").children(
            Example(h, { title: "Foldkit 0.x", files: h.props.provider.foldkit }),
            Example(h, { title: "Effect UI", files: h.props.provider.effect })
          ),
          h.figcaption.class("caption").children(
            "Foldkit 0.x provides Drafts at the root, to every Command. Effect UI provides it on Editor, in Editor's own file."
          )
        ),
        h.p.children(
          "Component.provide is Effect.provide for a component and everything below it. With two Editors on screen, each has its own text, and both use one Drafts service. It's built when the first Editor mounts and released when the last one unmounts. Mounting EditorNoDeps, which has no Layers, still compiles, but the mounted app then needs SaveDraft, and TypeScript won't let you run it until something provides one. A test can mount EditorNoDeps with a fake."
        )
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("What carries over"),
        h.p.children(
          "Effect UI keeps the same shape: a Schema Model, Messages, and pure init, update and view. Messages are facts, ClickedSave and not Save, and update decides what a fact means. Commands, Subscriptions and Mounts keep their names, and the runtime runs them. A child never knows its parent, and reports facts upward."
        ),
        h.p.children(
          "State is still Schema data. The server ships it, the Router restores it on Back, and the MessageLog records every update. Tests run no effects: each Command is data the test resolves by name."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("Moving from Foldkit 0.x"),
        h.p.children(
          "The upgrade guide isn't published yet. When it is, it will cover the API changes step by step. It's a migration, not a rewrite: your Models, Messages and update functions move across mostly as they are. Foldkit, the full-stack framework, builds on Effect UI from here. Effect UI is ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("on GitHub"),
          "."
        )
      ),
      h.footer.class("footer").children(
        h.p.children("This page is an Effect UI app. Its source is examples/launch in Effect-TS/ui.")
      )
    )
})
