import { srOnly, wide } from "#components/Classes"
import { Icon } from "#components/Icon"
import { Scrubber } from "#components/Scrubber"
import * as TabStrip from "#components/TabStrip"
import { type Fold, Snippet } from "#domain/Snippet"
import { Command, Subscription, UiSchema } from "@effect/ui"
import { Button, Collapsible, Tabs } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import { ScenarioId, scenarios } from "./scenarios.ts"
import { Frame } from "./trace.ts"
import { Wireframe } from "./Wireframe.ts"

export const PlayTestMessage = UiSchema.TaggedEnum({
  SelectedScenario: { id: ScenarioId },
  CompletedRun: { scenario: ScenarioId, frames: Schema.Array(Frame) },
  Scrubbed: { value: Schema.Number },
  ClickedPlay: {},
  ClickedPause: {},
  ClickedFold: { index: Schema.Number },
  Ticked: {}
})
type PlayTestMessage = typeof PlayTestMessage.Type

/** Runs a real Play test, and hands back the state after each line. */
export const RunPlayTest = Command.make(
  "RunPlayTest",
  { args: { scenario: ScenarioId } },
  ({ scenario }) =>
    scenarios[scenario].run.pipe(
      Effect.map((frames) =>
        PlayTestMessage.CompletedRun({ scenario, frames })
      )
    )
)

const PlayTestModel = Schema.Struct({
  selected: ScenarioId,
  frames: Schema.Array(Frame),
  cache: Schema.Record(Schema.String, Schema.Array(Frame)),
  /** The line last run, or null before the first. */
  position: Schema.NullOr(Schema.Number),
  isPlaying: Schema.Boolean,
  runs: Schema.Number,
  expandedFolds: Schema.Array(Schema.Number)
})
type PlayTestModel = typeof PlayTestModel.Type

const lastOf = (model: PlayTestModel) => model.frames.length - 1

const mono =
  "font-mono font-features-[normal] [font-variant-ligatures:none]"

// What else the test can read after the line it just ran, such as the
// TestClock. Before the first line, these are the values it starts
// with.
const Facts = (
  h: Html.H<PlayTestMessage>,
  frames: ReadonlyArray<Frame>,
  position: number | null
) =>
  h.dl.class(
    "grid min-h-[3.75rem] grid-cols-3 gap-3 border-b border-border",
    "bg-card px-3.5 py-3"
  ).children(
    (frames[position ?? 0]?.facts ?? []).map((fact) =>
      h.div.key(fact.part).class("flex min-w-0 flex-col gap-0.5")
        .children(
          h.dt.class(
            mono,
            "text-[10px] tracking-widest text-muted-foreground",
            "uppercase"
          ).children(fact.label),
          h.dd.class(
            mono,
            "truncate text-sm/[1.4] font-semibold tabular-nums"
          ).attr("data-part", fact.part).children(fact.value)
        )
    )
  )

const Bar = (h: Html.H<PlayTestMessage>, name: string, tag: string) =>
  h.p.class(
    "flex items-center justify-between gap-3 border-b border-border",
    "bg-muted px-3.5 py-2 text-[12px]/[normal] text-muted-foreground",
    mono
  ).children(
    h.span.class("text-foreground").children(name),
    h.span.class("text-[10px] tracking-widest uppercase").children(
      tag
    )
  )

const foldLineCount = (
  lines: Snippet["lines"],
  { end, start }: Fold
) => {
  let trimmed = end
  while (
    trimmed > start &&
    lines[trimmed - 1]!.every((token) => token.text.trim() === "")
  ) {
    trimmed--
  }
  const n = trimmed - start
  return n === 1 ? "1 line" : `${n} lines`
}

const Line = (
  h: Html.H<PlayTestMessage>,
  tokens: Snippet["lines"][number],
  index: number,
  shown: number | undefined
) =>
  h.span.key(String(index)).class(
    "block border-l-2 border-transparent ps-3 pe-3.5",
    "data-[current]:border-accent data-[current]:bg-wash",
    "motion-safe:transition-[background-color,border-color]",
    "motion-safe:duration-200"
  ).attr("data-current", index === shown ? "" : undefined)
    .children(
      tokens.map((token) =>
        h.span.style({ color: token.color }).children(token.text)
      ),
      "\n"
    )

const Run = (
  h: Html.H<PlayTestMessage>,
  key: string,
  lines: Snippet["lines"],
  start: number,
  end: number,
  shown: number | undefined
) =>
  end > start &&
  h.pre.key(key).class("wrap-anywhere whitespace-pre-wrap").children(
    h.code.children(
      lines.slice(start, end).map((tokens, offset) =>
        Line(h, tokens, start + offset, shown)
      )
    )
  )

const Lines = (
  h: Html.H<PlayTestMessage>,
  snippet: Snippet,
  sources: ReadonlyArray<string>,
  model: PlayTestModel
) => {
  const { expandedFolds, position } = model
  const current = position === null ? undefined : sources[position]
  // A test can run the same line twice, so the line on show is found
  // by how many times it has come up.
  const earlier = position === null
    ? 0
    : sources.slice(0, position).filter((source) =>
      source === current
    )
      .length
  const texts = snippet.lines.map((tokens) =>
    tokens.map((token) => token.text).join("").trim()
  )
  const shown =
    texts.flatMap((text, index) =>
      text === current ? [index] : []
    )[earlier]
  if (snippet.folds.length === 0) {
    return h.pre.class(
      "py-3 text-code wrap-anywhere whitespace-pre-wrap",
      "[font-variant-ligatures:none]"
    ).children(
      h.code.children(
        snippet.lines.map((tokens, index) =>
          Line(h, tokens, index, shown)
        )
      )
    )
  }
  return h.div.class(
    "py-3 font-mono text-code [font-variant-ligatures:none]"
  ).children(
    snippet.folds.flatMap((fold, index) => {
      const linesLabel = foldLineCount(snippet.lines, fold)
      return [
        Run(
          h,
          `run-${index}`,
          snippet.lines,
          snippet.folds[index - 1]?.end ?? 0,
          fold.start,
          shown
        ),
        Collapsible(h, {
          key: `${snippet.id}-fold-${index}`,
          props: { open: expandedFolds.includes(index) },
          onEmit: {
            Toggled: () => PlayTestMessage.ClickedFold({ index }),
            Settled: () => undefined
          },
          view: (collapsible) =>
            collapsible.root(h.div).children(
              collapsible.trigger(
                h.button.attr(
                  "aria-label",
                  `${fold.label}, ${linesLabel}`
                ).class(
                  "mb-2 flex w-full cursor-pointer items-center gap-1.5",
                  "px-3.5 py-0.5 text-start text-muted-foreground",
                  "select-none hover:bg-muted hover:text-foreground",
                  "aria-[expanded=false]:bg-muted",
                  "aria-[expanded=false]:hover:bg-border",
                  "focus-visible:-outline-offset-2",
                  "before:size-3.5 before:flex-none before:bg-current",
                  "before:content-['']",
                  "before:[mask:var(--icon-chevron)_center/contain_no-repeat]",
                  "before:transform-[rotate(-90deg)]",
                  "aria-expanded:before:transform-none",
                  "motion-safe:before:transition-[transform]",
                  "motion-safe:before:duration-150"
                )
              ).children(`${fold.label}, ${linesLabel}`),
              collapsible.panel(h.div)?.children(
                Run(
                  h,
                  "body",
                  snippet.lines,
                  fold.start,
                  fold.end,
                  shown
                )
              )
            )
        })
      ]
    }),
    Run(
      h,
      "rest",
      snippet.lines,
      snippet.folds.at(-1)?.end ?? 0,
      snippet.lines.length,
      shown
    )
  )
}

const cell = "col-start-1 row-start-1"

// The app as the test host holds it after the line that just ran.
// Every frame is drawn in one cell, so the tallest sets the height and
// nothing moves from one line to the next.
const Stage = (
  h: Html.H<PlayTestMessage>,
  frames: ReadonlyArray<Frame>,
  position: number | null
) =>
  h.div.class("grid px-3.5 py-4").attr("aria-hidden", "true")
    .children(
      h.p.key("empty").class(
        cell,
        "text-[0.8125rem]/[1.5] text-muted-foreground",
        position !== null && "invisible"
      ).children("Nothing is mounted yet."),
      frames.map((frame, index) =>
        h.div.key(String(index)).class(
          cell,
          index !== position && "invisible"
        ).attr(
          "data-part",
          index === position ? "stage" : undefined
        )
          .children(Wireframe(h, frame.nodes))
      )
    )

const Controls = (
  h: Html.H<PlayTestMessage>,
  model: PlayTestModel,
  sources: ReadonlyArray<string>
) => {
  const isLoaded = model.frames.length > 0
  const isAtEnd = isLoaded && model.position === lastOf(model)
  const shown = model.position === null ? 0 : model.position + 1
  return h.div.class(
    "flex items-center gap-3 border-t border-border bg-muted px-3.5",
    "py-2.5",
    // Where the test and the app are stacked, the figure is taller
    // than a phone, so the slider goes to the top and stays under
    // the page's bar while the figure scrolls by.
    "@max-[939px]/playtest:sticky @max-[939px]/playtest:top-(--nav-bar)",
    "@max-[939px]/playtest:z-1 @max-[939px]/playtest:order-1",
    "@max-[939px]/playtest:border-t-0 @max-[939px]/playtest:border-b",
    // There it's right under the tabs, so it has the active tab's
    // background and the two read as one sheet.
    "@max-[939px]/playtest:bg-card"
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

export const PlayTest = Html.component({
  name: "PlayTest",
  props: Schema.Struct({
    tests: Schema.Array(
      Schema.Struct({ id: ScenarioId, snippet: Snippet })
    )
  }),
  model: PlayTestModel,
  message: PlayTestMessage
}).make({
  init: ($) => {
    const selected = $.props.tests[0]?.id ?? "counter"
    return $.set({
      selected,
      frames: [],
      cache: {},
      position: null,
      isPlaying: false,
      runs: 0,
      expandedFolds: []
    }).run(
      ...$.props.tests.map(({ id }) =>
        RunPlayTest.make({ scenario: id })
      )
    )
  },
  update: {
    SelectedScenario: ($, { id }) => {
      const cached = $.model.cache[id]
      const next = $.evolve({
        selected: id,
        frames: cached ?? [],
        position: null,
        isPlaying: false,
        expandedFolds: []
      })
      return cached === undefined
        ? next.run(RunPlayTest.make({ scenario: id }))
        : next
    },
    CompletedRun: ($, { frames, scenario }) =>
      $.evolve({
        cache: { ...$.model.cache, [scenario]: frames },
        frames: scenario === $.model.selected
          ? frames
          : $.model.frames
      }),
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
    ClickedFold: ($, { index }) =>
      $.evolve({
        expandedFolds: (expanded) =>
          expanded.includes(index)
            ? expanded.filter((other) => other !== index)
            : [...expanded, index]
      }),
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
  view: (h, model) => {
    const { tests } = h.props
    const { notes, sources, title } = scenarios[model.selected]
    return h.figure.class(
      wide,
      "@container/playtest flex flex-col gap-3"
    ).attr("aria-label", title).children(
      Tabs(h, {
        key: "tests",
        props: {
          value: model.selected,
          tabs: tests.map(({ id }) => ({ value: id })),
          // The arrow keys show the next test as they move to its tab.
          activateOnFocus: true
        },
        onEmit: {
          Selected: ({ value }) => {
            const id = tests.find((test) => test.id === value)?.id
            return id === undefined
              ? undefined
              : PlayTestMessage.SelectedScenario({ id })
          }
        },
        view: (tabs) =>
          tabs.root(
            // Clipped, not hidden: a hidden overflow would stop the
            // slider from staying in view on a phone.
            h.div.class(
              "code-window flex flex-col overflow-clip rounded-lg",
              "border border-border"
            )
          ).children(
            h.div.class(TabStrip.strip).children(
              tabs.list(
                h.div.class(TabStrip.list).attr("aria-label", "Test")
              ).children(
                tabs.indicator(h.span.class(TabStrip.indicator)),
                tests.map(({ id }) =>
                  tabs.tab({
                    element: h.button.key(id).class(TabStrip.tab),
                    value: id
                  }).children(scenarios[id].label)
                )
              )
            ),
            tests.map(({ id, snippet }) => {
              const frames = id === model.selected
                ? model.frames
                : (model.cache[id] ?? [])
              const position = id === model.selected
                ? model.position
                : null
              return tabs.panel({
                element: h.div.key(id).class(
                  "@max-[939px]/playtest:order-2",
                  "data-[ending-style]:hidden"
                ),
                value: id
              })
                ?.children(
                  Facts(h, frames, position),
                  // The test and the app it drives, side by side
                  // where there is room.
                  h.div.class(
                    "grid",
                    "@min-[940px]/playtest:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
                  ).children(
                    h.div.class("min-w-0").children(
                      Bar(h, snippet.name, "TypeScript"),
                      Lines(h, snippet, sources, model)
                    ),
                    // First where the two are stacked: the app is
                    // what changes as the slider moves.
                    h.div.class(
                      "min-w-0 border-b border-border bg-background",
                      "@max-[939px]/playtest:order-first",
                      "@min-[940px]/playtest:border-b-0",
                      "@min-[940px]/playtest:border-l"
                    ).children(
                      Bar(h, "Test host tree", "Visualization"),
                      Stage(h, frames, position)
                    )
                  )
                )
            }),
            Controls(h, model, sources)
          )
      }),
      h.figcaption.class(
        "mx-auto w-full max-w-(--column) text-sm text-pretty",
        "text-muted-foreground"
      ).children(
        "Play tests render nothing and use no browser. This figure sketches the test host's in-memory tree after each line."
      ),
      h.p.class(srOnly).attr("aria-live", "polite").children(
        model.position === null ? "" : notes[model.position]
      )
    )
  }
})
