import { caption, srOnly } from "#components/Classes"
import { Icon } from "#components/Icon"
import { Scrubber } from "#components/Scrubber"
import { Snippet } from "#domain/Snippet"
import { Command, Subscription, UiSchema } from "@effect/ui"
import { Button } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import { Frame, run, sources } from "./trace.ts"

export const PlayTestMessage = UiSchema.TaggedEnum({
  CompletedRun: { frames: Schema.Array(Frame) },
  Scrubbed: { value: Schema.Number },
  ClickedPlay: {},
  ClickedPause: {},
  Ticked: {}
})
type PlayTestMessage = typeof PlayTestMessage.Type

/** Runs the real Play test, and hands back the state after each line. */
export const RunPlayTest = Command.make(
  "RunPlayTest",
  { args: {} },
  () =>
    run.pipe(
      Effect.map((frames) => PlayTestMessage.CompletedRun({ frames }))
    )
)

/** What each line of the test does, one per entry of `sources`. */
export const notes: ReadonlyArray<string> = [
  "The test mounts the real Counter on the test host. There's no browser and no DOM.",
  "The click sends ClickedAdd with an amount of 1, and the count is 1.",
  "The click runs the real DelayReset Command, which sleeps on the TestClock.",
  "The test moves the clock to 999 ms. DelayReset is still asleep.",
  "The count is still 1.",
  "One more millisecond, and DelayReset finishes and resets the count.",
  "The count is 0. The test never supplied the Command's result."
]

const before = "Drag the slider to run the test one line at a time."

const PlayTestModel = Schema.Struct({
  frames: Schema.Array(Frame),
  /** The line last run, or null before the first. */
  position: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
type PlayTestModel = typeof PlayTestModel.Type

const lastOf = (model: PlayTestModel) => model.frames.length - 1

const formatMs = (ms: number) => `${ms.toLocaleString("en-US")} ms`

const mono =
  "font-mono font-features-[normal] [font-variant-ligatures:none]"

const Fact = (
  h: Html.H<PlayTestMessage>,
  part: string,
  label: string,
  value: string
) =>
  h.div.class("flex min-w-0 flex-col gap-0.5").children(
    h.dt.class(
      mono,
      "text-[10px] tracking-widest text-muted-foreground uppercase"
    ).children(label),
    h.dd.class(mono, "text-sm/[1.4] font-semibold tabular-nums")
      .attr("data-part", part).children(value)
  )

// What the test can see after the line it just ran: the count on the
// test host, the TestClock and whether DelayReset is running.
const Facts = (h: Html.H<PlayTestMessage>, model: PlayTestModel) => {
  const frame = model.position === null
    ? undefined
    : model.frames[model.position]
  const count = frame?.nodes.find((node) => node.tag === "output")
  const isRunning =
    frame?.pending.some((command) =>
      command.name === "DelayReset"
    ) === true
  return h.dl.class(
    "grid grid-cols-3 gap-3 border-b border-border bg-background",
    "px-3.5 py-3"
  ).children(
    Fact(h, "count", "Count", count?.text ?? "–"),
    Fact(h, "clock", "TestClock", formatMs(frame?.clock ?? 0)),
    Fact(
      h,
      "command",
      "DelayReset",
      isRunning ? "Running" : "Not running"
    )
  )
}

const Lines = (
  h: Html.H<PlayTestMessage>,
  snippet: Snippet,
  position: number | null
) => {
  const current = position === null ? undefined : sources[position]
  return h.pre.class(
    "py-3 text-code wrap-anywhere whitespace-pre-wrap",
    "[font-variant-ligatures:none]"
  ).children(
    h.code.children(
      ...snippet.lines.map((tokens, index) => {
        const text = tokens.map((token) => token.text).join("").trim()
        return h.span.key(String(index)).class(
          "block border-l-2 border-transparent ps-3 pe-3.5",
          "data-[current]:border-accent data-[current]:bg-wash",
          "motion-safe:transition-[background-color,border-color]",
          "motion-safe:duration-200"
        ).attr("data-current", text === current ? "" : undefined)
          .children(
            ...tokens.map((token) =>
              h.span.style({ color: token.color }).children(
                token.text
              )
            ),
            "\n"
          )
      })
    )
  )
}

const Controls = (
  h: Html.H<PlayTestMessage>,
  model: PlayTestModel
) => {
  const isLoaded = model.frames.length > 0
  const isAtEnd = isLoaded && model.position === lastOf(model)
  const shown = model.position === null ? 0 : model.position + 1
  return h.div.class(
    "flex items-center gap-3 border-t border-border bg-muted px-3.5",
    "py-2.5"
  ).children(
    Button(h, {
      onPress: model.isPlaying
        ? PlayTestMessage.ClickedPause()
        : PlayTestMessage.ClickedPlay(),
      props: { disabled: !isLoaded, focusableWhenDisabled: true }
    }).class(
      "inline-flex min-w-[6.25rem] flex-none cursor-pointer",
      "items-center justify-center gap-1.5 rounded-md border",
      "border-foreground bg-foreground px-3 py-1 text-control",
      "font-medium text-background font-features-[normal]",
      "focus-visible:outline-accent aria-disabled:cursor-default",
      "aria-disabled:opacity-45"
    ).children(
      Icon(h, model.isPlaying ? "pause" : "play", {
        class: "size-3.5",
        filled: true
      }),
      model.isPlaying ? "Pause" : isAtEnd ? "Replay" : "Play"
    ),
    h.div.class("min-w-0 flex-1").children(
      Scrubber(h, {
        label: "Line of the test",
        valueText: model.position === null
          ? "Not started"
          : `Line ${shown} of ${sources.length}: ${
            sources[model.position]
          }`,
        value: shown,
        cells: sources.length,
        disabled: !isLoaded,
        onMove: (value) => PlayTestMessage.Scrubbed({ value })
      })
    )
  )
}

// Every note in one cell, so the tallest sets the height and nothing
// moves from one line to the next.
const Note = (h: Html.H<PlayTestMessage>, model: PlayTestModel) => {
  const shown = model.position === null ? 0 : model.position + 1
  return h.figcaption.class(caption, "mt-0 grid").attr(
    "aria-hidden",
    "true"
  ).children(
    ...[before, ...notes].map((text, index) =>
      h.span.key(String(index)).class(
        "col-start-1 row-start-1 text-pretty",
        index !== shown && "invisible"
      ).children(text)
    )
  )
}

export const PlayTest = Html.component({
  name: "PlayTest",
  props: Schema.Struct({ snippet: Snippet }),
  model: PlayTestModel,
  message: PlayTestMessage
}).make({
  init: ($) =>
    $.set({ frames: [], position: null, isPlaying: false, runs: 0 })
      .run(RunPlayTest.make({})),
  update: {
    CompletedRun: ($, { frames }) => $.evolve({ frames }),
    Scrubbed: ($, { value }) => {
      const line = Math.min(value, $.model.frames.length)
      return $.evolve({
        position: line > 0 ? line - 1 : null,
        isPlaying: false
      })
    },
    ClickedPlay: ($) =>
      $.evolve({
        position: $.model.position === null ||
            $.model.position === lastOf($.model)
          ? 0
          : $.model.position,
        isPlaying: true,
        runs: $.model.runs + 1
      }),
    ClickedPause: ($) => $.evolve({ isPlaying: false }),
    Ticked: ($) => {
      const position = Math.min(
        ($.model.position ?? -1) + 1,
        lastOf($.model)
      )
      return $.evolve({
        position,
        isPlaying: position < lastOf($.model)
      })
    }
  },
  subscriptions: ({ model }) => [
    model.isPlaying &&
    Subscription.make(
      "tick",
      model.runs,
      () =>
        Stream.tick("1400 millis").pipe(
          Stream.drop(1),
          Stream.map(() => PlayTestMessage.Ticked())
        )
    )
  ],
  view: (h, model) =>
    h.figure.class(
      "mx-auto my-10 flex max-w-(--column) flex-col gap-3",
      "[p+&]:mt-[1.1em]"
    ).attr("aria-label", "The delayed-reset Play test, line by line")
      .children(
        h.div.class(
          "code-window overflow-hidden rounded-lg border border-border"
        ).children(
          h.p.class(
            "flex items-center justify-between gap-3 border-b",
            "border-border bg-muted px-3.5 py-2.5 text-[12px]/[normal]",
            "text-muted-foreground",
            mono
          ).children(
            h.span.class("text-foreground").children(
              h.props.snippet.name
            ),
            h.span.class("text-[10px] tracking-widest uppercase")
              .children("TypeScript")
          ),
          Facts(h, model),
          Lines(h, h.props.snippet, model.position),
          Controls(h, model)
        ),
        Note(h, model),
        h.p.class(srOnly).attr("aria-live", "polite").children(
          model.position === null ? "" : notes[model.position]
        )
      )
})
