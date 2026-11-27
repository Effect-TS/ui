import { srOnly } from "#components/Classes"
import { Scrubber } from "#components/Scrubber"
import { UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { panel, SenderPicker, Transport } from "./controls.ts"
import * as P from "./player.ts"
import {
  Name,
  ScenarioName,
  scenarios,
  type Side,
  type Step
} from "./scenarios.ts"
import { Tree } from "./tree.ts"

// Position -1 is before anything is sent, 0..steps.length-1 are the
// steps, and steps.length is done.

export const DiagramMessage = UiSchema.TaggedEnum({
  PickedChoice: { choice: Name },
  ClickedPlay: {},
  ClickedPause: {},
  ClickedBack: {},
  ClickedNext: {},
  ClickedReset: {},
  Scrubbed: { value: Schema.Number },
  Ticked: {}
})
type Msg = typeof DiagramMessage.Type

const Model = Schema.Struct({ choice: Name, player: P.Player })

const stepsOf = (scenario: ScenarioName, choice: Name) =>
  scenarios[scenario].side.steps(choice)

const endOf = (scenario: ScenarioName, choice: Name) =>
  stepsOf(scenario, choice).length

const Lane = (
  h: Html.H<Msg>,
  side: Side,
  steps: ReadonlyArray<Step>,
  options: {
    readonly time: number
    readonly runs: number
  }
) => {
  const last = steps.length - 1
  const shown = Math.max(Math.min(options.time, last), -1)
  const done = options.time > last
  const isActive = options.time >= 0 && !done
  const step = shown >= 0 ? steps[shown] : undefined
  return h.div.class(
    panel,
    "gap-3 diagram-narrow:p-2.5",
    isActive &&
      "border-accent [box-shadow:0_0_0_1px_var(--color-accent)]",
    "motion-safe:transition-[border-color,box-shadow]",
    "motion-safe:duration-300"
  ).attrs({
    role: "group",
    "aria-label": side.subtitle,
    "data-active": isActive ? "true" : undefined
  }).children(
    h.div.class("flex items-baseline justify-between gap-2").children(
      h.p.class(
        "text-[0.9375rem]/[1.4] font-semibold"
      )
        .children(side.subtitle),
      h.p.class(
        "font-mono text-[0.6875rem] whitespace-nowrap tabular-nums",
        "font-features-[normal]",
        done || isActive
          ? "font-semibold text-accent-text"
          : "text-muted-foreground"
      ).attr("data-part", "progress").children(
        done ? "Done" : `${shown + 1}/${steps.length}`
      )
    ),
    Tree(h, {
      side,
      step,
      past: steps.slice(0, Math.max(shown, 0)),
      key: `${options.runs}-${Math.min(shown, last)}-${done}`,
      dim: (name) =>
        step !== undefined &&
        side.plain.includes(name) &&
        !step.nodes.includes(name),
      still: done
    }),
    // One segment per step, across the full width.
    h.div.class("flex gap-[3px]").attr("aria-hidden", "true")
      .children(
        steps.map((_, index) =>
          h.span.key(String(index)).class(
            "h-1.5 flex-1 rounded-full",
            index <= shown ? "bg-accent" : "bg-border-strong",
            "motion-safe:transition-[background-color]",
            "motion-safe:duration-300"
          )
        )
      ),
    // Every caption in one cell, so the tallest sets the height and
    // nothing moves while the steps play.
    h.div.class("grid text-[0.8125rem]/[1.5]").attr(
      "aria-hidden",
      "true"
    )
      .children(
        [undefined, ...steps].map((s, index) =>
          h.p.key(String(index)).class(
            "col-start-1 row-start-1 text-pretty",
            index - 1 !== shown && "invisible",
            s === undefined && "text-muted-foreground"
          ).children(
            s === undefined ? "Waiting for the Message." : s.text
          )
        )
      )
  )
}

// What the slider and the live region say about a position.
const describe = (steps: ReadonlyArray<Step>, time: number) => {
  if (time < 0) return "Not sent yet"
  if (time >= steps.length) {
    return `Done in ${steps.length} steps.`
  }
  return `Step ${time + 1} of ${steps.length}: ${steps[time]!.text}`
}

const names: Readonly<Record<ScenarioName, string>> = {
  sharedState: "How a Provider shares state in Effect UI"
}

export const Diagram = Html.component({
  name: "Diagram",
  props: Schema.Struct({ scenario: ScenarioName }),
  model: Model,
  message: DiagramMessage
}).make({
  init: () => ({ choice: "A1", player: P.idle }),
  update: {
    PickedChoice: ($, { choice }) =>
      $.evolve({ choice, player: P.reset($.model.player) }),
    ClickedPlay: ($) =>
      $.evolve({
        player: P.play(
          $.model.player,
          endOf($.props.scenario, $.model.choice)
        )
      }),
    ClickedPause: ($) =>
      $.evolve({ player: P.pause($.model.player) }),
    ClickedBack: ($) => $.evolve({ player: P.back($.model.player) }),
    ClickedNext: ($) =>
      $.evolve({
        player: P.next(
          $.model.player,
          endOf($.props.scenario, $.model.choice)
        )
      }),
    ClickedReset: ($) =>
      $.evolve({ player: P.reset($.model.player) }),
    Scrubbed: ($, { value }) =>
      $.evolve({
        player: P.seek(
          $.model.player,
          Math.min(
            Math.max(value - 1, -1),
            endOf($.props.scenario, $.model.choice)
          )
        )
      }),
    Ticked: ($) =>
      $.evolve({
        player: P.tick(
          $.model.player,
          endOf($.props.scenario, $.model.choice)
        )
      })
  },
  subscriptions: ({ model }) => [
    P.ticks(
      model.player,
      "1000 millis",
      () => DiagramMessage.Ticked()
    )
  ],
  view: (h, model) => {
    const scenario = scenarios[h.props.scenario]
    const { step: time, isPlaying, runs } = model.player
    const steps = scenario.side.steps(model.choice)
    const end = steps.length
    return h.figure.class(
      "mx-auto my-8 flex max-w-(--column) flex-col gap-4",
      "@container/diagram [p+&]:mt-[1.4em]"
    ).attr("aria-label", names[h.props.scenario]).children(
      h.div.class("flex flex-wrap items-end justify-between gap-3")
        .children(
          SenderPicker(
            h,
            scenario,
            model.choice,
            (choice) => DiagramMessage.PickedChoice({ choice })
          ),
          Transport(h, {
            isPlaying,
            atStart: time < 0,
            atEnd: time >= end,
            play: DiagramMessage.ClickedPlay(),
            pause: DiagramMessage.ClickedPause(),
            back: DiagramMessage.ClickedBack(),
            next: DiagramMessage.ClickedNext(),
            replay: DiagramMessage.ClickedReset()
          })
        ),
      Scrubber(h, {
        label: "Step",
        valueText: describe(steps, time),
        value: time + 1,
        cells: end + 1,
        onMove: (value) => DiagramMessage.Scrubbed({ value })
      }),
      Lane(h, scenario.side, steps, { time, runs }),
      h.p.class(srOnly).attr("aria-live", "polite").children(
        time < 0 ? "" : describe(steps, time)
      )
    )
  }
})
