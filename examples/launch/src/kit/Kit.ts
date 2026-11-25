import { Subscription, UiSchema } from "@effect/ui"
import { Toggle } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema, Stream } from "effect"
import { type Module, modules } from "./components.ts"
import { tile } from "./tiles.ts"

export { modules }

// Each tick starts one tile, and a tile plays for `playFor` ticks, so
// no more than three move at once. The stride shares no factor with
// the number of modules, so the order visits every tile once per
// round, and the next tile is rarely beside the last.
const tickMs = 650
const playFor = 3

const gcd = (a: number, b: number): number =>
  b === 0 ? a : gcd(b, a % b)

const stride = Array.from(
  { length: modules.length },
  (_, n) => 16 + n
)
  .find((n) => gcd(n, modules.length) === 1)!

/** The modules whose tiles play at `step`, the newest first. */
export const playingAt = (step: number): ReadonlyArray<Module> =>
  Array.from({ length: playFor }, (_, back) => step - back)
    .filter((started) => started >= 0)
    .map((started) => modules[(started * stride) % modules.length]!)

const prefersReducedMotion = () =>
  globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches ??
    false

export const KitMessage = UiSchema.TaggedEnum({
  Ticked: {},
  ToggledPause: { pressed: Schema.Boolean }
})

const Tile = <M>(h: Html.H<M>, name: Module, step: number) => {
  const isPlaying = playingAt(step).includes(name)
  return h.li.key(name).class("kit-tile").attr(
    "data-playing",
    isPlaying ? "" : undefined
  ).children(
    // The pictures are for looking at: the name below each one is
    // what a screen reader reads, and nothing inside takes focus.
    h.div.class("kit-picture").attr("aria-hidden", "true").attr(
      "inert",
      ""
    ).children(tile(h, name, isPlaying)),
    h.span.class("kit-name").children(name)
  )
}

/**
 * Every module of the UI kit, each drawn with the kit itself and set
 * moving a few at a time.
 */
export const Kit = Html.component({
  name: "Kit",
  model: Schema.Struct({
    step: Schema.Number,
    isPaused: Schema.Boolean
  }),
  message: KitMessage
}).make({
  init: () => ({ step: -1, isPaused: false }),
  update: {
    Ticked: ($) => $.evolve({ step: (step) => step + 1 }),
    ToggledPause: ($, { pressed }) => $.evolve({ isPaused: pressed })
  },
  subscriptions: ({ model }) => [
    !model.isPaused &&
    Subscription.make(
      "tick",
      Stream.tick(`${tickMs} millis`).pipe(
        Stream.filter(() => !prefersReducedMotion()),
        Stream.map(() => KitMessage.Ticked())
      )
    )
  ],
  view: (h, model) =>
    h.figure.class("kit").attr(
      "aria-label",
      "The modules of the UI kit"
    ).children(
      h.div.class("kit-head").children(
        h.p.class("kit-count").children(
          h.strong.children(String(modules.length)),
          h.span.children(
            "headless components, ready on day one."
          )
        ),
        Toggle(h, {
          props: { pressed: model.isPaused },
          onToggle: ({ pressed }) =>
            KitMessage.ToggledPause({ pressed })
        }).class("kit-pause").children(
          "Pause motion"
        )
      ),
      h.ul.class("kit-wall").children(
        modules.map((name) => Tile(h, name, model.step))
      )
    )
})
