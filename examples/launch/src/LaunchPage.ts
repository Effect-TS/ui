import { Code } from "#components/Code"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Architecture } from "./architecture/Architecture.ts"
import { Counter } from "./autocounter/Counter.ts"
import { Page } from "./counter/effect/Page.ts"
import { EmbedFoldkitPage } from "./counter/FoldkitEmbed.ts"
import { Nav } from "./nav/Nav.ts"
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
  head: () => [Head.title("How Foldkit 0.x evolves into Effect UI")],
  view: (_model, h) =>
    h.div.class("nav-layout").children(
      Nav(h, {}),
      h.main.class("article").children(
        h.header.class("article-head").children(
          h.h1.children("How Foldkit 0.x evolves into Effect UI"),
          P(
            h,
            "Feature work on Foldkit 0.x is paused and has moved to Effect UI. If you've built a Foldkit 0.x app, you'll migrate it rather than rewrite it. Some API changes are substantial, but the Elm Architecture you know still applies."
          ),
          h.p.children(
            "Effect UI is the \"new frontend foundation\" we announced in ",
            h.a.attr("href", "https://foldkit.dev/blog/foldkit-joins-effect").children("Foldkit Joins Effect"),
            ...Text(
              h,
              ". You import it from `effect/ui`. Foldkit will become the full-stack framework built on Effect UI."
            )
          ),
          P(
            h,
            "A Foldkit 0.x app is one Elm Architecture program. In Effect UI, each Component is its own Elm Architecture program and communicates with other Components in defined ways. We made that change to help apps compose and scale and to improve performance. This article explains what changes and why."
          )
        ),
        h.section.attr("aria-labelledby", "terms").children(
          h.h2.id("terms").children("Terms"),
          h.dl.class("terms").children(
            h.dt.children("Foldkit 0.x"),
            h.dd.children(
              "The existing frontend framework at ",
              h.a.attr("href", "https://foldkit.dev").children("foldkit.dev"),
              "."
            ),
            h.dt.children("Effect UI"),
            h.dd.children("The new frontend library that continues that work."),
            h.dt.children("Foldkit"),
            h.dd.children("The future full-stack framework built on Effect UI.")
          )
        ),
        h.section.attr("aria-labelledby", "architecture").children(
          h.h2.id("architecture").children("Effect UI moves the Model from the root of the app into each Component"),
          P(
            h,
            "A Foldkit 0.x app keeps one Model and one update at its root. In Effect UI, every Component has its own Model and update. Use the buttons in the diagram to send a Message from a leaf and see how each version handles it."
          ),
          Architecture(h, {}),
          P(
            h,
            "In Foldkit 0.x, the Message travels up to the root update and back down to the leaf's update, then the new value is written into the root Model. In Effect UI, the Component that sent the Message handles it in its own update and the runtime stores the result in that Component's Model."
          )
        ),
        h.section.attr("aria-labelledby", "define").children(
          h.h2.id("define").children("An Effect UI Component is a small Elm Architecture program"),
          P(
            h,
            "If you can read a counter in Foldkit 0.x, you can read one in Effect UI. It has a Model, Messages, init, update and view. It can also have Subscriptions."
          ),
          Beside(h, {
            label: "Live auto-counter",
            files: h.props.snippets.intro,
            demo: Counter(h, { key: "intro" }),
            caption: "Click \"Increment\", then turn \"Auto-count\" on and off."
          }),
          P(
            h,
            "Those familiar pieces have a streamlined API. You build an app by composing Components."
          )
        ),
        h.section.attr("aria-labelledby", "split").children(
          h.h2.id("split").children("You can pull functions out as a Component grows"),
          P(
            h,
            "The first counter defines everything inline in one call. That's easy to read for a small Component, but the call gets harder to follow as the Component grows. Separate named functions are easier to scan and can move into their own files. If you organize your Foldkit 0.x modules this way, the layout will look familiar."
          ),
          Listing(h, h.props.snippets.split, "The counter from the first example, written as separate functions."),
          P(
            h,
            "The Component definition's helpers supply the types for init, update, subscriptions and view, so you don't have to annotate the separate functions."
          )
        ),
        h.section.attr("aria-labelledby", "one-model").children(
          h.h2.id("one-model").children("In Foldkit 0.x, the entire application state is a single Model"),
          P(
            h,
            "In Foldkit 0.x, you can break an app into Submodels, but there is still one Model and one update at the root. Every change goes through the root update and DevTools can show every Message in order."
          ),
          P(
            h,
            "As an app grows, every part of it stays tied to the root. Each parent stores its children's state and forwards their Messages, even when it has no use for that state. Because the app is composed as one program before it starts, its code ships as one bundle and an error that escapes any part can stop the whole app."
          )
        ),
        h.section.attr("aria-labelledby", "components").children(
          h.h2.id("components").children("Effect UI applies the Elm Architecture to each Component"),
          P(
            h,
            "A Component is self-contained. You can write, test and reuse it on its own or remove it without changing how its parent manages state or handles Messages."
          ),
          P(
            h,
            "The runtime keeps a Model for each Component instance and delivers its Messages to its own update. To render a child Component, a parent calls it in its view. The parent doesn't store the child's state or forward its Messages."
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
            Caption(h, "Both counters are live. Click \"+\" in each.")
          ),
          P(
            h,
            "Inside each Component, the rules are unchanged: its state is its Model, only its own update changes that Model and every Message goes through update. Being self-contained also lets a Component bring its own services, load its code on demand and fail without stopping the rest of the app."
          )
        ),
        h.section.attr("aria-labelledby", "queries").children(
          h.h2.id("queries").children("Queries let the runtime fetch and refresh server data"),
          P(
            h,
            "In Foldkit 0.x, fetched data lives in the Model like any other state. Each resource needs a field in the Model, a Command to fetch it, a Message for the result and update branches for loading, success and failure. Foldkit 0.x's experimental `Query` packages that loop, but it's still a Submodel: the parent stores its Model, wraps its Messages and decides when to load or refresh. As the Foldkit 0.x docs put it, Query does not \"react to rendering, expire data after a duration, poll, or refresh related resources on its own\"."
          ),
          P(
            h,
            "Because the Model is also the cache, two parts of the app that show the same data need a shared ancestor to hold it. When a Command changes data on the server, the code that made the change has to refresh each affected Query by hand."
          ),
          P(
            h,
            "In Effect UI, you define a query once: its arguments, its result, how long the result stays fresh and how to fetch it. A Component lists the queries it needs and their arguments. The runtime fetches the data when the Component is rendered and the view reads the results."
          ),
          Compare(h, {
            foldkit: {
              title: "Foldkit 0.x: the parent stores and drives the Query",
              files: h.props.snippets.queryFoldkit
            },
            effect: { title: "Effect UI: the Component lists its query", files: h.props.snippets.queryEffect },
            caption: "Both load the same list of posts and show it."
          }),
          P(
            h,
            "The runtime keeps one cache for the app, keyed by query and arguments. Components that ask for the same data share one cache entry and one request. The runtime refetches stale entries and drops unused ones. A Command declares which queries it invalidates. When the Command ends, the runtime refetches the ones a Component is showing. The Model holds what the user did, without keeping a copy of fetched data."
          )
        ),
        h.section.attr("aria-labelledby", "testing").children(
          h.h2.id("testing").children("Story and Scene carry over, and Play runs real Commands and Subscriptions"),
          P(
            h,
            "Story tests update and Scene tests update through the view. In Foldkit 0.x, you pass the functions under test and a starting Model. In Effect UI, you pass the Component and the test starts from its init, so you don't have to supply that starting state separately."
          ),
          Compare(h, {
            foldkit: { title: "Foldkit 0.x Story: update and a given Model", files: h.props.snippets.storyFoldkit },
            effect: { title: "Effect UI Story: the Component itself", files: h.props.snippets.storyEffect }
          }),
          Compare(h, {
            foldkit: {
              title: "Foldkit 0.x Scene: update, view and a given Model",
              files: h.props.snippets.sceneFoldkit
            },
            effect: { title: "Effect UI Scene: the Component itself", files: h.props.snippets.sceneEffect }
          }),
          P(
            h,
            "Both kinds of test let you expect a Command and resolve it by hand. That's useful for testing what update does with the result, but the Command itself never runs. In Foldkit 0.x, you test the Command's Effect separately with a mock Layer."
          ),
          P(
            h,
            "Effect UI adds Play. It mounts the Component, lets you click its buttons and runs the real Commands and Subscriptions. With `TestClock`, the delayed-reset test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms."
          ),
          Listing(h, h.props.snippets.play)
        ),
        h.section.attr("aria-labelledby", "performance").children(
          h.h2.id("performance").children("Effect UI is faster than Foldkit 0.x in the benchmark"),
          h.p.children(
            "In ",
            h.a.attr("href", links.harness).children("js-framework-benchmark"),
            ", Effect UI spends less script time overall than Foldkit 0.x, paints sooner and uses less memory. The chart highlights Effect UI among all seven entries we ran on the same machine."
          ),
          PerformanceChart(h),
          AllResults(h)
        ),
        h.section.attr("aria-labelledby", "more").children(
          h.h2.id("more").children("More that is new in Effect UI"),
          h.ul.class("more").children(
            h.li.children(
              h.strong.children(...Text(h, "Services:")),
              " ",
              ...Text(
                h,
                "Provide the services a Component's Commands need with `Component.provide` and let TypeScript report any missing service at compile time."
              )
            ),
            h.li.children(
              h.strong.children(...Text(h, "Loading on demand:")),
              " ",
              ...Text(h, "Load a Component's code the first time it's rendered so it stays out of the initial bundle.")
            ),
            h.li.children(
              h.strong.children(...Text(h, "Failure boundaries:")),
              " ",
              ...Text(h, "Show a fallback for a Component that fails while the rest of the app keeps running.")
            ),
            h.li.children(
              h.strong.children(...Text(h, "Lifetime:")),
              " ",
              ...Text(
                h,
                "Mark a Component `scoped` to keep its Model while it's hidden instead of discarding the Model when the Component stops being rendered."
              )
            ),
            h.li.children(
              h.strong.children(...Text(h, "Command modes:")),
              " ",
              ...Text(
                h,
                "When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it."
              )
            ),
            h.li.children(
              h.strong.children(...Text(h, "`Command.asNoop`:")),
              " ",
              ...Text(h, "Run a Command without defining a result Message when update doesn't need the result.")
            ),
            h.li.children(
              h.strong.children(...Text(h, "Headless Components:")),
              " ",
              ...Text(h, "Supply your own markup while the Component manages its state and behavior.")
            ),
            h.li.children(
              h.strong.children(...Text(h, "Fragments:")),
              " ",
              ...Text(h, "Use a typed view function for a piece of the view that needs no Model of its own.")
            )
          )
        ),
        h.section.attr("aria-labelledby", "carries-over").children(
          h.h2.id("carries-over").children("Foldkit's values, features and guarantees carry over"),
          P(
            h,
            "The app-wide Model has become one Model per Component instance. The Model is still the source of truth for state, Messages are facts about what happened and every change to a Model goes through update. Side effects happen at explicit boundaries, never inside update or view."
          ),
          P(
            h,
            "Commands, Subscriptions and Mounts are still values the runtime runs. Story and Scene tests carry over. A child can still tell its parent what happened without holding a reference to it: where a Foldkit 0.x Submodel returns an OutMessage, an Effect UI Component emits a typed event with `$.emit`."
          ),
          P(
            h,
            "When you provide a `MessageLog`, the runtime records every Message a Component handles, in order, along with each query result. Replaying the Component's log reproduces its state."
          )
        ),
        h.section.attr("aria-labelledby", "next").children(
          h.h2.id("next").children("You can keep building on Foldkit 0.x"),
          P(
            h,
            "You can keep building with Foldkit 0.x while Effect UI reaches feature parity. Foldkit 0.x will receive critical bug fixes at least until Effect UI ships with an upgrade guide."
          ),
          h.p.children(
            "The work happens in ",
            h.a.attr("href", "https://github.com/Effect-TS/ui").children("Effect-TS/ui"),
            ". Existing Foldkit issues and pull requests will be transferred to Effect UI, so you don't need to open them again."
          )
        ),
        h.footer.class("footer").children(
          P(h, "This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.")
        )
      )
    )
})
