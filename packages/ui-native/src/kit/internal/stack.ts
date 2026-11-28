import * as Component from "@effect/ui/Component"
import * as Head from "@effect/ui/Head"
import * as Mount from "@effect/ui/Mount"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Native from "../../Native.ts"
import type { NativeNode } from "../../NativeHost.ts"
import type { StackEntry, StackTransition } from "../Stack.ts"
import { ScreenState } from "./screen.ts"

/**
 * A stack entry, as the stack draws it.
 *
 * @internal
 */
export type Entry = StackEntry<unknown>

/**
 * Draws a stack entry's screen.
 *
 * @internal
 */
export type Draw = Parameters<StackTransition["draw"]>[2]

/** @internal */
export const EntrySchema = Schema.Struct({
  id: Schema.Number,
  route: Schema.Unknown
})

/** @internal */
export const DrawSchema = Schema.declare((u): u is Draw =>
  typeof u === "function"
)

/**
 * Fills the stack.
 *
 * @internal
 */
export const fill = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
} as const

const Track = Mount.makeStream(
  "Screen",
  { args: { covered: Schema.Boolean, index: Schema.Number } },
  (node: NativeNode, args, changes) =>
    Stream.callback<never, never, ScreenState | Native.Host>(() =>
      Effect.gen(function*() {
        const screen = yield* ScreenState
        const host = yield* Native.Host
        // Focus moves to a screen that comes to the top: one that was
        // covered, or one pushed over the first.
        const show = (covered: boolean) => {
          if (screen.covered && !covered) host.accessibilityEvent(node, "focus")
          screen.covered = covered
        }
        screen.covered = args.index > 0
        show(args.covered)
        yield* Effect.forkScoped(
          Stream.runForEach(
            changes,
            ({ covered }) => Effect.sync(() => show(covered))
          )
        )
      })
    )
)

const hidden = [Head.reduce(() => ({ title: undefined }))]
const none: ReadonlyArray<Head.Entry> = []

/**
 * A screen of a stack. A covered one takes no touches, is hidden from the
 * screen reader and sets no title, and with `fade` it is also transparent.
 *
 * @internal
 */
export const Screen = Component.provide(
  Native.component({
    name: "Screen",
    props: Schema.Struct({
      entry: EntrySchema,
      index: Schema.Number,
      covered: Schema.Boolean,
      fade: Schema.Boolean,
      draw: DrawSchema
    }),
    model: Schema.Null,
    message: Schema.Never,
    restore: false
  }).make({
    init: () => null,
    update: ($) => $.model,
    // Only the top screen's title reaches the head.
    head: ($) => $.props.covered ? hidden : none,
    view: (s) => {
      const { covered, draw, entry, fade, index } = s.props
      return s.view
        .style({
          ...fill,
          opacity: fade && covered ? 0 : 1,
          pointerEvents: covered ? "none" : "auto"
        })
        .prop("collapsable", false)
        .prop(
          "importantForAccessibility",
          covered ? "no-hide-descendants" : "auto"
        )
        .prop("accessibilityElementsHidden", covered)
        .onMount(Track({ covered, index }))
        .children(draw(s as Native.H<never>, entry))
    }
  }),
  () =>
    Layer.effect(
      ScreenState,
      Effect.map(Effect.serviceOption(ScreenState), (parent) => ({
        covered: true,
        parent: Option.getOrUndefined(parent)
      }))
    )
)
