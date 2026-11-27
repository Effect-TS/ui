/**
 * A view that moves out of the software keyboard's way.
 *
 * `KeyboardAvoidingView` is a headless component: it follows the keyboard
 * with `Keyboard.onChange`, measures the view the consumer gives its `root`
 * part, and adjusts that view by how far it reaches below the keyboard's top.
 *
 * **Anatomy**
 *
 * | Part | Element |
 * | :-- | :-- |
 * | `root` | `view`, the view that avoids the keyboard |
 *
 * The parts also carry `inset`: how far the view reaches below the
 * keyboard, in points, and 0 while it's hidden.
 *
 * **Behaviors**
 *
 * - `"padding"` (the default): adds `inset` to the view's bottom padding,
 *   or replaces a percentage.
 * - `"height"`: makes the view `inset` shorter than it laid out.
 * - `"position"`: moves the view up by `inset`.
 *
 * The inset is measured from the view's bottom edge as it would be
 * without the adjustment, so it holds however the parent places the view
 * as it grows or shrinks.
 *
 * The view is measured on the surface, so it needs no offset for the views
 * above it. Set `offset` to the distance from the top of the screen to the
 * top of the surface when the surface doesn't start there, such as in a
 * native screen with a header.
 *
 * The view resizes without animation.
 *
 * **Example** (A form that stays above the keyboard)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { KeyboardAvoidingView } from "@effect/ui-native/kit"
 * import { Schema } from "effect"
 *
 * const SignIn = Native.component({
 *   name: "SignIn",
 *   model: Schema.Struct({}),
 *   message: Schema.Never
 * }).make({
 *   init: () => ({}),
 *   update: ($) => $.model,
 *   view: (h) =>
 *     KeyboardAvoidingView(h, {
 *       props: { behavior: "padding" },
 *       view: (avoiding) =>
 *         avoiding.root(h.view.style({ flex: 1, justifyContent: "flex-end" })).children(
 *           h.input.placeholder("Email")
 *         )
 *     })
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Native from "../Native.ts"
import * as Keyboard from "./Keyboard.ts"

/**
 * How `KeyboardAvoidingView` adjusts its view: by its bottom padding, its
 * height, or its position.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type KeyboardAvoidingViewBehavior = "padding" | "height" | "position"

/**
 * The props of `KeyboardAvoidingView`.
 *
 * **Details**
 *
 * - `behavior`: how the view moves out of the keyboard's way, `"padding"`
 *   by default.
 * - `offset`: the distance from the top of the screen to the top of the
 *   surface, in points. 0 by default.
 * - `enabled`: `false` leaves the view as it laid out. `true` by default.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export const KeyboardAvoidingViewProps = Schema.Struct({
  behavior: Schema.optional(Schema.Literals(["padding", "height", "position"])),
  offset: Schema.optional(Schema.Number),
  enabled: Schema.optional(Schema.Boolean)
})

/**
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type KeyboardAvoidingViewProps = typeof KeyboardAvoidingViewProps.Type

const Model = Schema.Struct({
  // The keyboard's top edge on the screen, or null while it's hidden.
  keyboardTop: Schema.NullOr(Schema.Number),
  // The view's bottom edge and height on the surface, as it laid out
  // without the inset, or null before it's measured.
  bottom: Schema.NullOr(Schema.Number),
  height: Schema.Number,
  // The bottom edge on screen when last measured, and the inset then.
  seen: Schema.Struct({ bottom: Schema.Number, inset: Schema.Number }),
  // Whether the consumer's bottom padding is a percentage, which the
  // padding replaces.
  percent: Schema.Boolean
})

const Message = UiSchema.TaggedEnum({
  ChangedKeyboard: { top: Schema.NullOr(Schema.Number) },
  LaidOut: { percent: Schema.Boolean },
  Measured: { y: Schema.Number, height: Schema.Number }
})

const Root = Native.ref("KeyboardAvoidingView")

const Measure = Command.make(
  "KeyboardAvoidingView.measure",
  { args: {} },
  () =>
    Effect.flatMap(
      Renderer.Refs.use((refs) => refs.lookup(Root)),
      (node) =>
        Native.Host.useSync((host) => {
          const rect = Option.isSome(node)
            ? host.measure(node.value)
            : undefined
          return rect === undefined
            ? Component.noop
            : Message.Measured({ y: rect.y, height: rect.height })
        })
    )
)

type Props = KeyboardAvoidingViewProps
type Model = typeof Model.Type

const insetOf = (props: Props, model: Model): number =>
  props.enabled === false || model.keyboardTop === null ||
    model.bottom === null
    ? 0
    : Math.max(0, model.bottom + (props.offset ?? 0) - model.keyboardTop)

// The consumer's bottom padding, which the inset adds to. A percentage
// can't be added to, so it's replaced.
const paddingOf = (style: Native.LayoutStyle) =>
  style.paddingBottom ?? style.paddingVertical ?? style.padding

const adjusted = (
  props: Props,
  model: Model,
  inset: number,
  style: Native.LayoutStyle
): Native.LayoutStyle => {
  switch (props.behavior ?? "padding") {
    case "padding":
      return { paddingBottom: (Number(paddingOf(style)) || 0) + inset }
    case "height":
      return { height: Math.max(0, model.height - inset), flex: 0 }
    case "position":
      return { position: "relative", bottom: inset }
  }
}

/**
 * A view that avoids the keyboard. Call it with the consumer's `h`, the
 * `props`, and a `view` closure that applies `root` to the view.
 *
 * **Details**
 *
 * `root` measures the view after each change of its layout or of the
 * keyboard. While `inset` is above 0 it sets the adjusting style after the
 * consumer's: `paddingBottom` as the consumer's bottom padding plus
 * `inset`, or for the other behaviors `height` and `flex`, or `bottom`
 * and `position`, which replace the consumer's. Otherwise the view keeps
 * the consumer's style.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const KeyboardAvoidingView = Native.component({
  name: "KeyboardAvoidingView",
  props: KeyboardAvoidingViewProps,
  model: Model,
  message: Message,
  restore: false
}).make({
  init: () => ({
    keyboardTop: null,
    bottom: null,
    height: 0,
    seen: { bottom: 0, inset: 0 },
    percent: false
  }),
  update: {
    ChangedKeyboard: ($, { top }) =>
      $.set({ ...$.model, keyboardTop: top }).run(Measure.make()),
    LaidOut: ($, { percent }) =>
      $.set({ ...$.model, percent }).run(Measure.make()),
    // The frame includes the inset on screen, which the props and Model
    // give: a render commits before the next message. The adjustment moves
    // the view's bottom edge by a share of how much it changed, which the
    // parent's layout sets: the padding grows the view and the height
    // shrinks it, at its top, its bottom or both, and the position moves it.
    // Movement up to that much is the adjustment's, and is left out of the
    // edge the inset is computed from, so the inset doesn't move it again.
    Measured: ($, { height, y }) => {
      const { model, props } = $
      const inset = insetOf(props, model)
      const edge = y + height
      const behavior = props.behavior ?? "padding"
      const reach = (behavior === "padding" ? 1 : -1) *
        (inset - model.seen.inset)
      const moved = edge - model.seen.bottom
      // Replacing a percentage changes the padding by an amount not known
      // here, at most the inset.
      const own = behavior === "padding" && model.percent &&
          model.seen.inset === 0
        ? Math.min(moved, reach)
        : Math.min(Math.max(moved, Math.min(0, reach)), Math.max(0, reach))
      const bottom = model.bottom === null || inset === 0
        ? edge
        : model.bottom + moved - own
      return $.set({
        ...model,
        // Less than a point is the layout's rounding.
        bottom: model.bottom !== null && Math.abs(bottom - model.bottom) < 1
          ? model.bottom
          : bottom,
        height: behavior === "height" ? height + inset : height,
        seen: { bottom: edge, inset }
      })
    }
  },
  subscriptions: ({ props }) => [
    props.enabled !== false &&
    Keyboard.onChange((keyboard) =>
      Message.ChangedKeyboard({ top: keyboard?.screenY ?? null })
    )
  ],
  parts: (p, model) => {
    // Follows the props at once, such as `enabled` turning off.
    const inset = insetOf(p.props, model)
    return {
      inset,
      root: p.part("view", (b) =>
        b.ref(Root).forward((view) => {
          const laidOut = view.on(
            "layout",
            Message.LaidOut({
              percent: typeof paddingOf(view.props) === "string"
            })
          )
          return inset > 0
            ? laidOut.style(adjusted(p.props, model, inset, view.props))
            : laidOut
        }))
    }
  }
})
