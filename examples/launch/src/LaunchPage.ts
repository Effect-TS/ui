import { Code } from "#components/Code"
import { type Snippet, Snippets } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Architecture } from "./architecture/Architecture.ts"
import { Counter } from "./autocounter/Counter.ts"
import { Nav } from "./nav/Nav.ts"
import { AllResults, PerformanceChart } from "./performance/Chart.ts"
import { links } from "./performance/Results.ts"

const Example = <M>(h: View.H<M>, options: {
  readonly title: string
  readonly files: ReadonlyArray<Snippet>
}) =>
  h.section.class("example").attr("aria-label", options.title)
    .children(
      h.p.class("example-title").children(options.title),
      h.div.class("example-body").children(...Files(h, options.files))
    )

const Files = <M>(h: View.H<M>, files: ReadonlyArray<Snippet>) =>
  files.map((snippet) =>
    h.div.key(snippet.name).children(Code(h, snippet))
  )

const Caption = <M>(h: View.H<M>, text: string) =>
  h.figcaption.class("caption").children(...Text(h, text))

const Listing = <M>(
  h: View.H<M>,
  files: ReadonlyArray<Snippet>,
  caption?: string
) =>
  h.figure.class("listing wide").children(
    ...Files(h, files),
    caption && Caption(h, caption)
  )

const Beside = <M>(h: View.H<M>, options: {
  readonly label: string
  readonly files: ReadonlyArray<Snippet>
  readonly demo: View.Content<M>
  readonly caption: string
}) =>
  h.figure.class("beside wide").children(
    h.div.class("beside-columns").children(
      h.div.class("beside-code").children(...Files(h, options.files)),
      h.div.class("demo beside-demo").attr("role", "group").attr(
        "aria-label",
        options.label
      ).children(options.demo)
    ),
    Caption(h, options.caption)
  )

const Compare = <M>(h: View.H<M>, options: {
  readonly foldkit: {
    readonly title: string
    readonly files: ReadonlyArray<Snippet>
  }
  readonly effect: {
    readonly title: string
    readonly files: ReadonlyArray<Snippet>
  }
  readonly caption?: string
}) =>
  h.figure.class("compare wide").children(
    h.div.class("compare-columns").children(
      Example(h, options.foldkit),
      Example(h, options.effect)
    ),
    options.caption && Caption(h, options.caption)
  )

const Text = <M>(h: View.H<M>, text: string) =>
  text.split("`").map((part, index) =>
    index % 2 === 0 ? part : h.code.children(part)
  )

const P = <M>(h: View.H<M>, text: string) =>
  h.p.children(...Text(h, text))

const changes = {
  architecture: "The core change: Component-based architecture",
  queries: "Addition: Built-in queries",
  testing: "Change: Simpler Story and Scene tests",
  play: "Addition: Play tests",
  performance: "Change: Improved performance"
} as const

const More = <M>(h: View.H<M>, label: string, text: string) =>
  h.li.children(h.strong.children(`${label}:`), " ", ...Text(h, text))

export const LaunchPage = Component.define({
  name: "LaunchPage",
  scoped: false,
  props: Schema.Struct({ snippets: Snippets }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: ($) => $.model,
  head: () => [Head.title("Foldkit 0.x becomes Effect UI")],
  view: (h) =>
    h.div.class("nav-layout").children(
      Nav(h, {}),
      h.main.class("article").children(
        h.header.class("article-head").children(
          h.h1.children("Foldkit 0.x becomes Effect UI"),
          h.p.children(
            "Effect UI is the new frontend library that continues the work of Foldkit 0.x, the framework at ",
            h.a.attr("href", "https://foldkit.dev").children(
              "foldkit.dev"
            ),
            ". We announced it as the \"new frontend foundation\" in ",
            h.a.attr(
              "href",
              "https://foldkit.dev/blog/foldkit-joins-effect"
            ).children("Foldkit Joins Effect"),
            ". Feature work on Foldkit 0.x is paused and has moved to Effect UI."
          ),
          P(
            h,
            "If you've built an app with Foldkit 0.x, you can keep building with it for now. When Effect UI ships with an upgrade guide, you'll migrate your app rather than rewrite it."
          ),
          P(h, "This article covers what is changing in Effect UI:"),
          h.ul.class("changes").children(
            ...Object.entries(changes).map(([id, title]) =>
              h.li.key(id).children(
                h.a.attr("href", `#${id}`).children(title)
              )
            )
          ),
          P(h, "It also covers what will stay the same.")
        ),
        h.section.attr("aria-labelledby", "terms").children(
          h.h2.id("terms").children("Terms"),
          h.dl.class("terms").children(
            h.dt.children("Foldkit 0.x"),
            h.dd.children(
              "The existing frontend framework at ",
              h.a.attr("href", "https://foldkit.dev").children(
                "foldkit.dev"
              ),
              "."
            ),
            h.dt.children("Effect UI"),
            h.dd.children(
              ...Text(
                h,
                "The new frontend library that continues that work. You import it from `effect/ui`."
              )
            ),
            h.dt.children("Foldkit"),
            h.dd.children(
              "The future full-stack framework built on Effect UI."
            )
          )
        ),
        h.section.attr("aria-labelledby", "architecture").children(
          h.h2.id("architecture").children(changes.architecture),
          P(
            h,
            "Foldkit 0.x used the Elm Architecture. This architecture has many benefits, but meaningful drawbacks including performance challenges, issues with code splitting and scalability concerns."
          ),
          P(
            h,
            "Effect UI addresses these issues. In Effect UI, an app is built from Components. Each Component is an Elm Architecture program with a Model, Messages, init, update and view. You build your application by composing Components."
          ),
          h.section.attr("aria-labelledby", "messages").children(
            h.h3.id("messages").children(
              "How Messages travel in Foldkit 0.x vs. Effect UI"
            ),
            P(
              h,
              "In Foldkit 0.x, every Message was handled by the root update function. If the application was decomposed into Submodels, the root update delegated to the relevant Submodel update function(s) to transition to the next state. The new state was slotted into the single application Model, and then the view function ran from the root with that new Model."
            ),
            P(
              h,
              "In Effect UI, a Message for a Component is delivered directly to that Component's update function. The runtime then stores that Component's new Model, and its view runs. This gives you the benefits of the explicit state transitions of the Elm Architecture, without asking you to handle Message wiring."
            ),
            P(
              h,
              "The diagram below illustrates how a Message is handled in each architecture."
            ),
            Architecture(h, {}),
            P(
              h,
              "In Foldkit 0.x, you compose an app from Submodels. Each parent stores its children's state and forwards their Messages, so every Message passes through the root update. In Effect UI, the runtime keeps each Component's Model and delivers a Message to the update of the Component that sent it."
            )
          ),
          h.section.attr("aria-labelledby", "code").children(
            h.h3.id("code").children(
              "Foldkit 0.x vs. Effect UI code comparison"
            ),
            P(
              h,
              "In Effect UI, to render a child Component, a parent just calls it in its view. The parent doesn't store the child's state or forward its Messages."
            ),
            Compare(h, {
              foldkit: {
                title:
                  "Foldkit 0.x: Page stores and forwards for Counter",
                files: h.props.snippets.counterFoldkit
              },
              effect: {
                title: "Effect UI: Page renders Counter",
                files: h.props.snippets.counterEffect
              }
            })
          ),
          h.section.attr("aria-labelledby", "self-contained")
            .children(
              h.h3.id("self-contained").children(
                "Components are self-contained"
              ),
              P(
                h,
                "A Foldkit 0.x app is composed as one program before it starts, so its code ships as one bundle and an error that escapes any part can stop the whole app."
              ),
              P(
                h,
                "An Effect UI Component is self-contained. You can write, test and reuse it on its own or remove it without changing how its parent manages state or handles Messages. It can also bring its own services, load its code on demand and fail without stopping the rest of the app."
              ),
              P(
                h,
                "Here is a counter with a delayed reset Command and an auto-count Subscription."
              ),
              Beside(h, {
                label: "Live auto-counter",
                files: h.props.snippets.intro,
                demo: Counter(h, { key: "intro" }),
                caption:
                  "Click \"Increment\", then turn \"Auto-count\" on and off."
              })
            ),
          h.section.attr("aria-labelledby", "split").children(
            h.h3.id("split").children("Organizing larger Components"),
            P(
              h,
              "You can still extract init, update, subscriptions and view. This can help keep things readable as your Component grows."
            ),
            P(
              h,
              "The Component definition's helpers supply the types, so you don't have to annotate the extracted functions."
            ),
            Listing(
              h,
              h.props.snippets.split,
              "The same counter with each function extracted."
            )
          )
        ),
        h.section.attr("aria-labelledby", "queries").children(
          h.h2.id("queries").children(changes.queries),
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
              title:
                "Foldkit 0.x: the parent stores and drives the Query",
              files: h.props.snippets.queryFoldkit
            },
            effect: {
              title: "Effect UI: the Component lists its query",
              files: h.props.snippets.queryEffect
            },
            caption: "Both load the same list of posts and show it."
          }),
          P(
            h,
            "The runtime keeps one cache for the app, keyed by query and arguments. Components that ask for the same data share one cache entry and one request. The runtime refetches stale entries and drops unused ones. A Command declares which query results it makes out of date. When the Command ends, the runtime refetches the ones a Component is showing. The Model holds what the user did, without keeping a copy of fetched data."
          )
        ),
        h.section.attr("aria-labelledby", "testing").children(
          h.h2.id("testing").children(changes.testing),
          P(
            h,
            "Story tests update and Scene tests update through the view. In Foldkit 0.x, you pass the functions under test and a starting Model. In Effect UI, you pass the Component, so there is no starting state to supply separately."
          ),
          Compare(h, {
            foldkit: {
              title: "Foldkit 0.x Story: update and a given Model",
              files: h.props.snippets.storyFoldkit
            },
            effect: {
              title: "Effect UI Story: the Component itself",
              files: h.props.snippets.storyEffect
            }
          }),
          Compare(h, {
            foldkit: {
              title:
                "Foldkit 0.x Scene: update, view and a given Model",
              files: h.props.snippets.sceneFoldkit
            },
            effect: {
              title: "Effect UI Scene: the Component itself",
              files: h.props.snippets.sceneEffect
            }
          })
        ),
        h.section.attr("aria-labelledby", "play").children(
          h.h2.id("play").children(changes.play),
          P(
            h,
            "Play mounts the Component, lets you click its buttons and runs the real Commands and Subscriptions."
          ),
          P(
            h,
            "Story and Scene tests let you expect a Command and resolve it by hand. That's useful for testing what update does with the result, but the Command itself never runs. In Foldkit 0.x, you test the Command's Effect separately with a mock Layer."
          ),
          P(
            h,
            "With `TestClock`, the delayed-reset Play test can check that the count is 1 at 999 ms and changes to 0 at 1,000 ms."
          ),
          Listing(h, h.props.snippets.play)
        ),
        h.section.attr("aria-labelledby", "performance").children(
          h.h2.id("performance").children(changes.performance),
          h.p.children(
            "In ",
            h.a.attr("href", links.harness).children(
              "js-framework-benchmark"
            ),
            ", Effect UI spends less time running JavaScript overall than Foldkit 0.x, paints sooner and uses less memory. The chart highlights Effect UI among all seven entries we ran on the same machine."
          ),
          PerformanceChart(h),
          AllResults(h)
        ),
        h.section.attr("aria-labelledby", "more").children(
          h.h2.id("more").children("More changes"),
          h.ul.class("more").children(
            More(
              h,
              "Services per Component",
              "Provide the services a Component's Commands need with `Component.provide`. TypeScript reports a missing service at compile time."
            ),
            More(
              h,
              "Load Components on demand",
              "Load a Component's code the first time it's rendered so it stays out of the initial bundle."
            ),
            More(
              h,
              "Recover from Component failures",
              "Show a fallback for a Component that fails while the rest of the app keeps running."
            ),
            More(
              h,
              "Keep state while hidden",
              "Mark a Component `scoped` to keep its Model while it's hidden. Otherwise the Model is discarded when the Component stops being rendered."
            ),
            More(
              h,
              "Control overlapping Commands",
              "When a Command is issued again while still running, use `concurrent` to run both, `switch` to interrupt the earlier run or `queue` to wait for it."
            ),
            More(
              h,
              "Commands without result Messages",
              "Use `Command.asNoop` to run a Command when update doesn't need its result."
            ),
            More(
              h,
              "Custom markup for headless Components",
              "Supply your own markup while the Component manages its state and behavior."
            ),
            More(
              h,
              "Reusable view fragments",
              "Use a typed view function for a piece of the view that needs no Model of its own."
            )
          )
        ),
        h.section.attr("aria-labelledby", "carries-over").children(
          h.h2.id("carries-over").children(
            "Unchanged: Values, features and guarantees"
          ),
          P(
            h,
            "The Model is still the source of truth for state, Messages are facts about what happened and every change to a Model goes through update. Side effects happen at explicit boundaries, never inside update or view."
          ),
          P(
            h,
            "Commands, Subscriptions and Mounts are still values the runtime runs. A child can still tell its parent what happened without holding a reference to it: where a Foldkit 0.x Submodel returns an OutMessage, an Effect UI Component emits a typed event with `$.emit`."
          ),
          P(
            h,
            "Foldkit 0.x DevTools can show every Message because each one goes through the root update. Effect UI keeps that record per Component. When you provide a `MessageLog`, the runtime records every Message a Component handles, in order, along with each query result. Replaying the Component's log reproduces its state."
          )
        ),
        h.section.attr("aria-labelledby", "next").children(
          h.h2.id("next").children(
            "You can keep building on Foldkit 0.x"
          ),
          P(
            h,
            "Effect UI doesn't have everything Foldkit 0.x has. DevTools, state-preserving live reload and the crash view, for example, are not in Effect UI today. You can keep building with Foldkit 0.x, and it will receive critical bug fixes at least until Effect UI ships with an upgrade guide."
          ),
          h.p.children(
            "Effect UI is developed in ",
            h.a.attr("href", "https://github.com/Effect-TS/ui")
              .children("Effect-TS/ui"),
            ". Existing Foldkit issues and pull requests will be transferred there, so you don't need to open them again. If your app relies on something this article doesn't cover, open an issue there and tell us."
          )
        ),
        h.footer.class("footer").children(
          P(
            h,
            "This article is built with Effect UI. Browse the source in `examples/launch` in Effect-TS/ui."
          )
        )
      )
    )
})
