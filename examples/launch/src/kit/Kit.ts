import { Command, Subscription, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
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

const ModuleName = Schema.Literals(modules)

export const KitMessage = UiSchema.TaggedEnum({
  Ticked: {},
  EnteredTile: { name: ModuleName },
  FinishedHoverPlay: { name: ModuleName }
})
type KitMessage = typeof KitMessage.Type

const KitModel = Schema.Struct({
  step: Schema.Number,
  // Tiles the pointer set playing, each for as long as a tile the
  // timer starts.
  hovered: Schema.Array(ModuleName)
})
type KitModel = typeof KitModel.Type

/** Ends a tile's play that the pointer started. */
export const FinishHoverPlay = Command.make(
  "FinishHoverPlay",
  { args: { name: ModuleName } },
  ({ name }) =>
    Effect.sleep(`${tickMs * playFor} millis`).pipe(
      Effect.as(KitMessage.FinishedHoverPlay({ name }))
    )
)

const isPlaying = (model: KitModel, name: Module) =>
  model.hovered.includes(name) || playingAt(model.step).includes(name)

const Tile = (
  h: Html.H<KitMessage>,
  name: Module,
  model: KitModel
) => {
  const playing = isPlaying(model, name)
  return h.li.key(name).class("kit-tile").attr(
    "data-playing",
    playing ? "" : undefined
  ).on("mouseenter", KitMessage.EnteredTile({ name })).on(
    "click",
    KitMessage.EnteredTile({ name })
  ).children(
    // The pictures are for looking at: the name below each one is
    // what a screen reader reads, and nothing inside takes focus.
    h.div.class("kit-card").attr("aria-hidden", "true").attr(
      "inert",
      ""
    ).children(
      // Drawn again only when the tile starts or stops playing.
      h.div.class("kit-picture").children(h.lazy(tile, name, playing))
    ),
    h.span.class("kit-name").children(name)
  )
}

/**
 * Every module of the UI kit, each drawn with the kit itself and set
 * moving a few at a time.
 */
export const Kit = Html.component({
  name: "Kit",
  model: KitModel,
  message: KitMessage
}).make({
  init: () => ({ step: -1, hovered: [] }),
  update: {
    Ticked: ($) => $.evolve({ step: (step) => step + 1 }),
    // A tile that is already playing ignores the pointer.
    EnteredTile: ($, { name }) =>
      isPlaying($.model, name) ? $.model : $.evolve({
        hovered: (hovered) => [...hovered, name]
      }).run(FinishHoverPlay.make({ name })),
    FinishedHoverPlay: ($, { name }) =>
      $.evolve({
        hovered: (hovered) => hovered.filter((tile) => tile !== name)
      })
  },
  subscriptions: () => [
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
      h.ul.class("kit-wall").children(
        modules.map((name) => Tile(h, name, model))
      )
    )
})
