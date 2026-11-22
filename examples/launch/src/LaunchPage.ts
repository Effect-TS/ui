import { Flow } from "#components/Flow"
import { Snippet } from "#domain/Snippet"
import { Component, Head, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { DialogPage } from "./demo/DialogPage.ts"
import { foldkitSteps } from "./foldkitFlow.ts"

export const LaunchPageProps = Schema.Struct({
  effect: Snippet,
  foldkit: Schema.Array(Snippet)
})
export type LaunchPageProps = typeof LaunchPageProps.Type

const Section = <M>(h: View.H<M>, label: string) => h.section.class("section").attr("aria-label", label)

const Label = <M>(h: View.H<M>, text: string) => h.p.class("label").children(`// ${text}`)

const names = [
  ["Foldkit 0.x", "The frontend framework on npm today, foldkit@0.171."],
  ["Effect UI", "@effect/ui, where Foldkit's frontend work continues."],
  ["Foldkit", "The full-stack framework, with Effect UI as its frontend."]
] as const

const kept = [
  ["The same shape", "A Schema Model, Messages, and pure init, update and view."],
  ["Messages are facts", "ClickedSave, not Save. update decides what a fact means."],
  ["Effects are data", "Commands, Subscriptions and Mounts keep their names, and the runtime runs them."],
  ["One-way flow", "A child never knows its parent. It reports facts upward."],
  [
    "State is Schema data",
    "The server ships it, the Router restores it on Back, and the MessageLog records every update."
  ],
  ["Tests run no effects", "Each Command is data the test resolves by name."]
] as const

const totals = [
  ["Messages", "8, all through the page's update", "8: 6 to the Dialog, 2 to the page"],
  ["Commands", "6", "0"],
  ["Other", "4 OutMessages: 2 to the page, 2 from Animation to the Dialog", "1 Mount, 4 events, 2 prop changes"]
] as const

export const LaunchPage = Component.define({
  name: "LaunchPage",
  scoped: false,
  props: LaunchPageProps,
  model: Schema.Struct({}),
  message: Schema.Never,
  elements: Html
}).make({
  init: () => ({}),
  update: (model) => model,
  head: () => [Head.title("Foldkit's frontend continues as Effect UI")],
  view: (_model, h) =>
    h.main.class("page").children(
      h.header.class("hero").children(
        Label(h, "Effect UI"),
        h.h1.class("title").children("Foldkit's frontend continues as Effect UI"),
        h.p.class("lede").children(
          "Foldkit 0.x was a frontend framework. Its frontend work continues as Effect UI, and Foldkit becomes the full-stack framework built on it. If you've built with Foldkit 0.x, most of what you know carries over. This page shows the one thing that changed the most, and why."
        ),
        h.dl.class("names").children(
          ...names.map(([name, description]) =>
            h.div.key(name).class("name").children(h.dt.children(name), h.dd.children(description))
          )
        )
      ),
      Section(h, "Where state lives").children(
        Label(h, "Where state lives"),
        h.h2.children("One Model you could read top to bottom"),
        h.p.class("prose").children(
          "In Foldkit 0.x the whole app is one Schema Model, and every Message goes through one update. You could start at the Model, follow a Message, and see exactly what changed and why. That made apps easy to reason about and easy to test. Effect UI keeps what made that work:"
        ),
        h.dl.class("kept").children(
          ...kept.map(([term, description]) =>
            h.div.key(term).class("kept-item").children(h.dt.children(term), h.dd.children(description))
          )
        )
      ),
      Section(h, "Where it got heavy").children(
        Label(h, "Where it got heavy"),
        h.h2.children("Every child's state went through its parent"),
        h.div.class("split").children(
          h.div.class("prose").children(
            h.p.children(
              "One Model meant the parent stored each child's Model. Every message the child sent was wrapped, routed through the parent's update, and unwrapped again, even when the parent had no decision to make."
            ),
            h.p.children(
              "foldkit.dev's own source has 59 Got*Message wrappers, 84 Update.foldChild* call sites and 88 h.submodel embeds. That's wiring you write and maintain, and so do your agents."
            )
          ),
          h.figure.class("wrappers").children(
            h.div.class("wrapper").children(
              h.code.children("GotUiPageMessage"),
              h.div.class("wrapper").children(
                h.code.children("GotDialogDemoMessage"),
                h.div.class("wrapper wrapper-core").children(h.code.children("Dialog.Message"))
              )
            ),
            h.figcaption.children("A click in foldkit.dev's Dialog demo reaches the root inside two wrappers.")
          )
        )
      ),
      Section(h, "What changes").children(
        Label(h, "What changes"),
        h.h2.children("Each component holds its own state"),
        h.p.class("prose").children(
          "In Effect UI every component instance has its own Schema Model, changed only by its own update. A parent passes props down and handles the events its children emit. It no longer stores a child's state or forwards its messages. Your Models, Messages and update functions are written the same way, and the MessageLog still records every step under the instance's path."
        ),
        h.p.class("prose").children(
          "Here is the same confirm dialog in both. The Effect UI one is running: open it, close it, and step through what the log recorded."
        ),
        h.div.class("compare").children(
          Flow(h, {
            key: "foldkit",
            props: {
              title: "Foldkit 0.x",
              files: h.props.foldkit,
              steps: foldkitSteps,
              live: false,
              page: {
                name: "Page",
                note: "Stores the dialog's Model",
                state: ["confirm.isOpen: false", "confirm.animation: Idle"]
              },
              dialog: { name: "Dialog.update", note: "Runs on the Model the page passes in", state: [] },
              empty: "Press Step to follow one open and one close."
            }
          }),
          Flow(h, {
            key: "effect",
            props: {
              title: "Effect UI",
              files: [h.props.effect],
              steps: [],
              live: true,
              page: { name: "DialogPage", note: "Owns whether the dialog is open", state: ["confirm: false"] },
              dialog: {
                name: "Dialog",
                note: "Owns focus and transition state",
                state: ["mounted: false", "started: false"]
              },
              empty: "Press Discard draft to record what happens."
            },
            slots: { demo: h.div.class("demo").children(DialogPage(h, {})) }
          })
        ),
        h.table.class("totals").children(
          h.caption.children("One open and one close, counted"),
          h.thead.children(
            h.tr.children(
              h.th.attr("scope", "col").children(""),
              h.th.attr("scope", "col").children("Foldkit 0.x"),
              h.th.attr("scope", "col").children("Effect UI")
            )
          ),
          h.tbody.children(
            ...totals.map(([name, foldkit, effect]) =>
              h.tr.key(name).children(
                h.th.attr("scope", "row").children(name),
                h.td.children(foldkit),
                h.td.children(effect)
              )
            )
          )
        )
      ),
      Section(h, "Lifetime").children(
        Label(h, "Lifetime"),
        h.h2.children("State lasts as long as the component is rendered"),
        h.p.class("prose").children(
          "Stop rendering a component and its Model goes with it. That's the trade for not storing every child's state yourself, and we think it's the right one."
        )
      ),
      Section(h, "What's next").children(
        Label(h, "What's next"),
        h.h2.children("Moving from Foldkit 0.x"),
        h.p.class("prose").children(
          "An upgrade guide will cover the API changes step by step. It's a migration, not a rewrite: your Models, Messages and update functions move across mostly as they are. Foldkit, the full-stack framework, builds on Effect UI from here."
        ),
        h.p.class("links").children(
          h.a.class("button primary").attr("href", "https://github.com/Effect-TS/ui").children("Effect UI on GitHub")
        )
      ),
      h.footer.class("footer").children(
        h.p.children("This page is an Effect UI app. Its source is examples/launch in Effect-TS/ui.")
      )
    )
})
