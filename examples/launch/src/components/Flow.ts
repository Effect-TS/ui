import { FlowStep } from "#domain/FlowStep"
import { countLines, lineOf, Snippet } from "#domain/Snippet"
import { Component, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import { DialogTrace } from "../trace/DialogTrace.ts"
import { Code } from "./Code.ts"

const FlowBox = Schema.Struct({
  name: Schema.String,
  note: Schema.String,
  state: Schema.Array(Schema.String)
})

export const FlowProps = Schema.Struct({
  title: Schema.String,
  files: Schema.Array(Snippet),
  steps: Schema.optional(Schema.Array(FlowStep)),
  page: FlowBox,
  dialog: FlowBox,
  empty: Schema.String
})
export type FlowProps = typeof FlowProps.Type

export const FlowModel = Schema.Struct({
  recorded: Schema.Array(FlowStep),
  step: Schema.Number,
  playing: Schema.Boolean
})
export type FlowModel = typeof FlowModel.Type

export const FlowMessage = UiSchema.TaggedEnum({
  RecordedStep: { step: FlowStep },
  Ticked: {},
  ClickedStep: {},
  ClickedReset: {},
  ClickedPill: { index: Schema.Number }
})

const stepsOf = (model: FlowModel, props: FlowProps): ReadonlyArray<FlowStep> => props.steps ?? model.recorded

const stateAt = (
  steps: ReadonlyArray<FlowStep>,
  step: number,
  box: "page" | "dialog",
  initial: ReadonlyArray<string>
) => {
  for (let index = step; index >= 0; index--) {
    const state = steps[index]?.[box]
    if (state !== undefined) return state
  }
  return initial
}

const playInterval = "1200 millis"

export const Flow = Component.define({
  name: "Flow",
  scoped: false,
  props: FlowProps,
  model: FlowModel,
  message: FlowMessage,
  slots: ["demo"],
  elements: Html
}).make({
  init: () => ({ recorded: [], step: -1, playing: false }),
  update: {
    RecordedStep: (model, { step }, $) =>
      step.starts
        ? $.evolve({ recorded: [step], step: 0, playing: true })
        : model.recorded.length === 0
        ? model
        : $.evolve({ recorded: (recorded) => [...recorded, step], playing: true }),
    Ticked: (model, _message, $) =>
      model.step < stepsOf(model, $.props).length - 1
        ? $.evolve({ step: (step) => step + 1 })
        : $.evolve({ playing: false }),
    ClickedStep: (model, _message, $) =>
      $.evolve({ step: Math.min(model.step + 1, stepsOf(model, $.props).length - 1), playing: false }),
    ClickedReset: (_model, _message, $) => $.evolve({ step: -1, playing: false }),
    ClickedPill: (_model, { index }, $) => $.evolve({ step: index, playing: false })
  },
  subscriptions: (model, props) => [
    props.steps === undefined && Subscription.make(
      "trace",
      Stream.unwrap(Effect.gen(function*() {
        const trace = yield* DialogTrace
        return trace.steps.pipe(Stream.map((step) => FlowMessage.RecordedStep({ step })))
      }))
    ),
    model.playing &&
    Subscription.make("play", Stream.tick(playInterval).pipe(Stream.drop(1), Stream.as(FlowMessage.Ticked())))
  ],
  view: (model, h) => {
    const props = h.props
    const steps = stepsOf(model, props)
    const current = steps[model.step]
    const fileCount = props.files.length
    const box = (name: "page" | "dialog") =>
      h.div.class("box").attr("data-active", current?.at === name ? "" : undefined).children(
        h.p.class("box-name").children(props[name].name),
        h.p.class("box-note").children(props[name].note),
        h.ul.class("box-state").children(
          ...stateAt(steps, model.step, name, props[name].state).map((line) => h.li.key(line).children(line))
        )
      )
    return h.figure.class("flow").attr("aria-label", props.title).children(
      h.header.class("flow-head").children(
        h.h3.class("flow-title").children(props.title),
        h.p.class("flow-meta").children(
          `${countLines(props.files)} lines in ${fileCount} ${fileCount === 1 ? "file" : "files"}`
        )
      ),
      h.slots.demo,
      h.div.class("stage").children(
        box("page"),
        h.div.class("channel").children(
          current?.move !== undefined &&
            h.span.key(`chip-${model.step}`).class("chip").attr("data-move", current.move).children(current.name)
        ),
        box("dialog")
      ),
      h.div.class("readout").children(
        current === undefined
          ? h.p.class("entry entry-empty").children(steps.length === 0 ? "No entries yet" : `${steps.length} steps`)
          : h.p.class("entry").children(
            h.span.class("kind").children(current.kind),
            h.code.class("entry-name").children(current.name),
            h.span.class("entry-where").children(current.where)
          ),
        h.p.class("caption").attr("aria-live", "polite").children(current?.caption ?? props.empty)
      ),
      h.div.class("controls").children(
        h.ol.class("pills").attr("aria-label", "Steps").children(
          ...steps.map((step, index) =>
            h.li.key(String(index)).children(
              h.button.class("pill").attr("type", "button")
                .attr("aria-current", index === model.step ? "step" : undefined)
                .attr("aria-label", `Step ${index + 1}: ${step.name}`)
                .onClick(FlowMessage.ClickedPill({ index }))
                .children(String(index + 1))
            )
          )
        ),
        h.div.class("buttons").children(
          h.button.class("button primary").attr("type", "button").disabled(model.step >= steps.length - 1)
            .onClick(FlowMessage.ClickedStep()).children("Step"),
          h.button.class("button").attr("type", "button").disabled(model.step < 0)
            .onClick(FlowMessage.ClickedReset()).children("Reset")
        )
      ),
      h.div.class("files").children(
        ...props.files.map((snippet) =>
          h.div.key(snippet.name).children(Code(h, { snippet, lit: lineOf(snippet, current?.line) }))
        )
      )
    )
  }
})
