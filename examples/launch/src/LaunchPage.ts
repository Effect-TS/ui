import { Code } from "#components/Code"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Counter } from "./autocounter/Counter.ts"
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
  head: () => [Head.title("Foldkit 0.x continues as Effect UI")],
  view: (_model, h) =>
    h.main.class("article").children(
      h.header.class("article-head").children(
        h.h1.children("Foldkit 0.x continues as Effect UI"),
        h.p.children(
          "We have paused feature work on ",
          h.a.attr("href", "https://foldkit.dev").children("Foldkit 0.x"),
          " and moved that work to Effect UI, the new frontend foundation announced in ",
          h.a.attr("href", "https://foldkit.dev/blog/foldkit-joins-effect").children("Foldkit Joins Effect"),
          ...Text(
            h,
            ". You import it from `effect/ui`, and Foldkit will become the full-stack framework built on top of it."
          )
        ),
        P(
          h,
          "If you've been building with Foldkit 0.x, Effect UI will feel familiar, yet streamlined. Where a Foldkit 0.x app is one big Elm Architecture application, each Effect UI Component is its own little one, and Components have structured ways of communicating. Your app will be migrated, not rewritten. Some of the API changes are substantial, but all of them move in the right direction, towards better composability, scalability and performance."
        ),
        P(h, "This page covers what is changing in Effect UI and why.")
      ),
      h.section.attr("aria-labelledby", "terms").children(
        h.h2.id("terms").children("Terms"),
        h.dl.class("terms").children(
          h.dt.children("Foldkit 0.x"),
          h.dd.children("The existing frontend framework at foldkit.dev."),
          h.dt.children("Effect UI"),
          h.dd.children("The new frontend library that continues that work."),
          h.dt.children("Foldkit"),
          h.dd.children("The future full-stack framework built on Effect UI.")
        )
      ),
      h.section.attr("aria-labelledby", "architecture").children(
        h.h2.id("architecture").children("A Message is handled by the Component that sent it"),
        P(
          h,
          "Send a Message from any leaf below and watch each architecture handle it."
        ),
        P(
          h,
          "In Foldkit 0.x, the Message travels up to the root update and back down to the leaf's update, and the new value is written into the one Model at the root. In Effect UI, the Component that sent the Message handles it in its own update, and the runtime stores the result in that Component's Model."
        )
      ),
      h.section.attr("aria-labelledby", "define").children(
        h.h2.id("define").children("Components are the unit of composition in Effect UI"),
        P(
          h,
          "A Component is a small Elm Architecture program that you compose with other Components. It has a Model, Messages, init, update and view, the same pieces as a Foldkit 0.x app with a streamlined API. Here is a counter with a delayed reset and an auto-count."
        ),
        Beside(h, {
          label: "Live auto-counter",
          files: h.props.snippets.intro,
          demo: Counter(h, { key: "intro" }),
          caption: "Click \"Increment\", then turn \"Auto-count\" on and off."
        })
      ),
      h.section.attr("aria-labelledby", "split").children(
        h.h2.id("split").children("You can still write init, update and view as separate functions"),
        P(
          h,
          "The counter above defines everything inline in one call. That is easy to read while a Component is small, and it gets harder to follow as the Component grows. Separate named functions are easier to scan and can move into their own files, and they match how a Foldkit 0.x module is laid out."
        ),
        Listing(h, h.props.snippets.split, "The counter from the first example, written as separate functions."),
        P(
          h,
          "`CounterDef.init`, `CounterDef.update`, `CounterDef.subscriptions` and `CounterDef.view` infer their types from the Component definition, so the extracted functions need no type annotations."
        )
      ),
      h.section.attr("aria-labelledby", "one-model").children(
        h.h2.id("one-model").children("In Foldkit 0.x, the entire application state is a single Model"),
        P(
          h,
          "In Foldkit 0.x, you can break an app into Submodels, but there is still one Model and one update at the root. Every change goes through that update, which is why DevTools can show every Message in the order it happened."
        ),
        P(
          h,
          "As an app grows, that ties every part of it to the root. Each parent stores its children's state and forwards their Messages, even when it has no use for either. The app is composed as one program before it starts, so its code ships as one bundle, and an error that escapes any part of it stops the whole app."
        )
      ),
      h.section.attr("aria-labelledby", "components").children(
        h.h2.id("components").children("In Effect UI, each Component has its own Model, Messages and update"),
        P(
          h,
          "We think an app composed of small Elm Architecture programs is a better design than one large program. Each Component is self-contained, so you can write it, test it and reuse it on its own."
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
          Caption(h, "Both are live. Click \"+\" in each.")
        ),
        P(
          h,
          "Inside a Component the rules are the ones you know: its state is its Model, only its own update changes that Model and every Message goes through update. Being self-contained is also what lets a Component bring its own services, load its code on demand and fail without stopping the rest of the app."
        )
      ),
      h.section.attr("aria-labelledby", "queries").children(
        h.h2.id("queries").children("A Component declares the data it shows, and the runtime fetches it"),
        P(
          h,
          "In Foldkit 0.x, data fetched from a server lives in the Model like any other state. Each resource takes a field in the Model, a Command that fetches it, a Message for the result and update branches for loading, success and failure. The experimental `Query` packages that loop, but a Query is still a Submodel: the parent stores its Model, wraps its Messages and decides when to load and when to refresh."
        ),
        P(
          h,
          "The Model is also the cache, so two parts of an app that show the same data need a shared ancestor to hold it, and after a change on the server you refresh each affected Query by hand."
        ),
        P(
          h,
          "In Effect UI, queries are first class. You define a query once, with its arguments, its result, how long a result stays fresh and how to fetch it. A Component lists the queries it shows, and the runtime fetches them when the Component is rendered."
        ),
        Compare(h, {
          foldkit: {
            title: "Foldkit 0.x: the parent stores and drives the Query",
            files: h.props.snippets.queryFoldkit
          },
          effect: { title: "Effect UI: the Component lists the query", files: h.props.snippets.queryEffect },
          caption: "Both load the same list of posts when they start."
        }),
        P(
          h,
          "The runtime keeps one cache for the whole app, keyed by query and arguments. Components that ask for the same data share one entry and one request. The runtime reuses a fresh result, refetches a stale one and drops an entry that no Component uses, and a Command declares which queries it invalidates. The Model holds what the user did and never a copy of fetched data."
        )
      ),
      h.section.attr("aria-labelledby", "testing").children(
        h.h2.id("testing").children("Story and Scene carry over, and Play runs the real Commands"),
        P(
          h,
          "Story tests update, and Scene tests update through the view. In Foldkit 0.x you pass the functions under test and a starting Model. In Effect UI you pass the Component, and the test starts from its init."
        ),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Story: update and a given Model", files: h.props.snippets.storyFoldkit },
          effect: { title: "Effect UI Story: the Component itself", files: h.props.snippets.storyEffect }
        }),
        Compare(h, {
          foldkit: { title: "Foldkit 0.x Scene: update, view and a given Model", files: h.props.snippets.sceneFoldkit },
          effect: { title: "Effect UI Scene: the Component itself", files: h.props.snippets.sceneEffect }
        }),
        P(
          h,
          "Both kinds of test expect a Command and resolve it by hand. That tests what update does with the result, while the Command itself never runs. In Foldkit 0.x you test the Command's Effect separately, with a mock Layer."
        ),
        P(
          h,
          "Effect UI adds Play. It mounts the Component, clicks its buttons and runs the real Commands and Subscriptions, with `TestClock` in control of time."
        ),
        Listing(
          h,
          h.props.snippets.play,
          "Play runs the real `DelayReset` against a test clock. The count is 1 at 999 ms and 0 at one second."
        )
      ),
      h.section.attr("aria-labelledby", "performance").children(
        h.h2.id("performance").children("Effect UI is faster than Foldkit 0.x"),
        h.p.children(
          "On ",
          h.a.attr("href", links.harness).children("js-framework-benchmark"),
          ", Effect UI spends less script time overall than Foldkit 0.x, paints sooner and uses less memory. Here it is beside the other entries we ran on the same machine."
        ),
        PerformanceChart(h),
        AllResults(h)
      ),
      h.section.attr("aria-labelledby", "more").children(
        h.h2.id("more").children("More that is new in Effect UI"),
        h.ul.class("more").children(
          h.li.children(
            ...Text(
              h,
              "A Component provides the services its own Commands need with `Component.provide`, and TypeScript reports a missing one at compile time."
            )
          ),
          h.li.children(
            ...Text(
              h,
              "A Component's code can load the first time the Component is rendered, so it stays out of the first bundle."
            )
          ),
          h.li.children(...Text(h, "A Component that fails shows a fallback while the rest of the app keeps running.")),
          h.li.children(
            ...Text(
              h,
              "A Component's Model is discarded when the Component stops being rendered, and a `scoped` Component keeps its Model while it is hidden."
            )
          ),
          h.li.children(
            ...Text(
              h,
              "A Command declares what happens when it is issued again while still running: `concurrent` runs both, `switch` interrupts the earlier run and `queue` waits for it."
            )
          ),
          h.li.children(
            ...Text(h, "`Command.asNoop` runs a Command without a result Message when update doesn't need the result.")
          ),
          h.li.children(
            ...Text(h, "A headless Component keeps its own state and behavior and lets you write the markup.")
          ),
          h.li.children(
            ...Text(h, "A fragment is a typed view function for a piece of a view that needs no Model of its own.")
          )
        )
      ),
      h.section.attr("aria-labelledby", "carries-over").children(
        h.h2.id("carries-over").children("Foldkit's values, features and guarantees carry over"),
        P(
          h,
          "The architecture changed: one application Model became one Model per Component. Foldkit's values did not. The Model is still the source of truth for state, Messages are still facts about what happened and every change to a Model still goes through update. Side effects still happen at explicit boundaries, never inside update or view."
        ),
        P(
          h,
          "The features carry over too. Commands, Subscriptions and Mounts are still values the runtime runs. A child still tells its parent what happened without holding a reference to it: where a Foldkit 0.x Submodel returns an OutMessage, an Effect UI Component emits a typed event with `$.emit`."
        ),
        P(
          h,
          "So do the guarantees. When you provide a `MessageLog`, the runtime records every Message a Component handles, in order, along with each query result. Replaying that log reconstructs the Component's state."
        )
      ),
      h.section.attr("aria-labelledby", "next").children(
        h.h2.id("next").children("You can keep building with Foldkit 0.x"),
        P(
          h,
          "You can keep building with Foldkit 0.x while Effect UI reaches feature parity. Foldkit 0.x will get critical bug fixes at least until Effect UI ships with an upgrade guide."
        ),
        h.p.children(
          "The work happens in ",
          h.a.attr("href", "https://github.com/Effect-TS/ui").children("Effect-TS/ui"),
          ". Existing Foldkit issues and pull requests will be transferred there, so you don't need to open them again."
        )
      ),
      h.footer.class("footer").children(
        P(h, "This page is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui.")
      )
    )
})
