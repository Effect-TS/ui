import { srOnly, wide } from "#components/Classes"
import { Component, UiSchema, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { panel, SenderPicker, Transport } from "./controls.ts"
import * as P from "./player.ts"
import {
  Name,
  type Scenario,
  ScenarioName,
  scenarios,
  type Side
} from "./scenarios.ts"
import { Tree } from "./tree.ts"

// The two architectures handle the same Message in turn,
// Foldkit 0.x and then Effect UI, on one timeline. Position -1 is
// before anything is sent. Then comes a position per step of the first
// side and a position per step of the second, and at the last position
// both are done.

export const DiagramMessage = UiSchema.TaggedEnum({
  PickedChoice: { choice: Name },
  ClickedPlay: {},
  ClickedPause: {},
  ClickedBack: {},
  ClickedNext: {},
  ClickedReset: {},
  Scrubbed: { value: Schema.String },
  Ticked: {}
})
type Msg = typeof DiagramMessage.Type

const Model = Schema.Struct({ choice: Name, player: P.Player })

interface Turn {
  readonly side: Side
  readonly steps: ReturnType<Side["steps"]>
  // The timeline position of the side's first step.
  readonly start: number
}

const turnsOf = (
  scenario: Scenario,
  choice: Name
): ReadonlyArray<Turn> => {
  const [first, second] = scenario.sides
  const steps = first.steps(choice)
  return [
    { side: first, steps, start: 0 },
    { side: second, steps: second.steps(choice), start: steps.length }
  ]
}

const endOf = (scenario: ScenarioName, choice: Name) =>
  turnsOf(scenarios[scenario], choice).reduce(
    (total, turn) => total + turn.steps.length,
    0
  )

const isPlayingAt = (turn: Turn, time: number) =>
  time >= turn.start && time < turn.start + turn.steps.length

const Lane = (
  h: View.H<Msg>,
  turn: Turn,
  options: {
    readonly time: number
    readonly isDimmed: boolean
    readonly waiting: string
    readonly runs: number
  }
) => {
  const { side, steps } = turn
  const last = steps.length - 1
  const local = options.time - turn.start
  const shown = Math.max(Math.min(local, last), -1)
  const done = local > last
  const isActive = isPlayingAt(turn, options.time)
  const step = shown >= 0 ? steps[shown] : undefined
  return h.div.class(
    panel,
    "gap-3 diagram-narrow:p-2.5",
    isActive &&
      "border-accent [box-shadow:0_0_0_1px_var(--color-accent)]",
    options.isDimmed && "opacity-55",
    "motion-safe:transition-[border-color,box-shadow,opacity]",
    "motion-safe:duration-300"
  ).attrs({
    role: "group",
    "aria-label": side.title,
    "data-active": isActive ? "true" : undefined
  }).children(
    h.div.class("flex items-baseline justify-between gap-2").children(
      h.p.class(
        "text-[0.9375rem]/[1.4] font-semibold whitespace-nowrap"
      )
        .children(side.title),
      h.p.class(
        "font-mono text-[0.6875rem] whitespace-nowrap tabular-nums",
        "font-features-[normal]",
        done || isActive
          ? "font-semibold text-accent"
          : "text-muted-foreground"
      ).attr("data-part", "progress").children(
        done ? "Done" : `${shown + 1}/${steps.length}`
      )
    ),
    Tree(h, {
      side,
      step,
      past: steps.slice(0, Math.max(shown, 0)),
      // Changes only on this side's own steps, so its packets don't
      // play again while the other side takes its turn.
      key: `${options.runs}-${Math.min(shown, last)}-${done}`,
      compact: true,
      still: done
    }),
    // One segment per step, across the full width.
    h.div.class("flex gap-[3px]").attr("aria-hidden", "true")
      .children(
        ...steps.map((_, index) =>
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
        ...[undefined, ...steps].map((s, index) =>
          h.p.key(String(index)).class(
            "col-start-1 row-start-1 text-pretty",
            index - 1 !== shown && "invisible",
            s === undefined && "text-muted-foreground"
          ).children(s === undefined ? options.waiting : s.text)
        )
      )
  )
}

// What the slider and the live region say about a position.
const describe = (
  turns: ReadonlyArray<Turn>,
  time: number,
  end: number
) => {
  if (time < 0) return "Not sent yet"
  if (time >= end) {
    return turns.map(({ side, steps }) =>
      `${side.title} took ${steps.length} steps.`
    ).join(" ")
  }
  const turn = turns.find((candidate) => isPlayingAt(candidate, time))
  if (turn === undefined) return ""
  const index = time - turn.start
  return `${turn.side.title}, step ${
    index + 1
  } of ${turn.steps.length}: ${turn.steps[index]!.text}`
}

// The slider has a stop before the first step and one after the last,
// so each side's label sits under the stops of its own steps.
const Timeline = (
  h: View.H<Msg>,
  turns: ReadonlyArray<Turn>,
  time: number,
  end: number
) =>
  h.div.class("flex flex-col gap-1").children(
    h.input.class(
      "w-full accent-accent focus-visible:outline-accent"
    ).attrs({
      type: "range",
      min: "0",
      max: String(end + 1),
      step: "1",
      "aria-label": "Step",
      "aria-valuetext": describe(turns, time, end)
    }).value(String(time + 1)).onInput(({ value }) =>
      DiagramMessage.Scrubbed({ value })
    ),
    h.div.class(
      "flex font-mono text-[0.6875rem] text-muted-foreground",
      "font-features-[normal]"
    ).attr("aria-hidden", "true").children(
      h.span.style({ flex: "0.5" }),
      ...turns.map((turn) =>
        h.span.key(turn.side.id).style({
          flex: String(turn.steps.length)
        }).class(
          "truncate border-t-2 border-border-strong pt-1 text-center",
          "not-last:me-1",
          isPlayingAt(turn, time) &&
            "border-accent font-semibold text-accent",
          "motion-safe:transition-[border-color,color]",
          "motion-safe:duration-300"
        ).children(turn.side.title)
      ),
      h.span.style({ flex: "0.5" })
    )
  )

export const Diagram = Component.define({
  name: "Diagram",
  props: Schema.Struct({ scenario: ScenarioName }),
  model: Model,
  message: DiagramMessage,
  elements: Html
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
            Math.max(Number(value) - 1, -1),
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
    const turns = turnsOf(scenario, model.choice)
    const end = endOf(h.props.scenario, model.choice)
    const isOnePlaying = turns.some((turn) => isPlayingAt(turn, time))
    return h.figure.class(
      wide,
      "@container/diagram flex flex-col gap-4 [--wide:920px]"
    ).children(
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
      Timeline(h, turns, time, end),
      h.div.class("grid grid-cols-2 gap-4 diagram-narrow:gap-2")
        .children(
          ...turns.map((turn, index) =>
            h.div.key(turn.side.id).class("contents").children(
              Lane(h, turn, {
                time,
                isDimmed: isOnePlaying && !isPlayingAt(turn, time),
                waiting: index === 0 || time < 0
                  ? "Waiting for the Message."
                  : `Plays after ${turns[0]!.side.title}.`,
                runs
              })
            )
          )
        ),
      h.p.class(srOnly).attr("aria-live", "polite").children(
        time < 0 ? "" : describe(turns, time, end)
      )
    )
  }
})
