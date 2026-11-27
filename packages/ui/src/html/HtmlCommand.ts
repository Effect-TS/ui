/**
 * The HTML Commands: element ref operations (`focus`, `blur`,
 * `scrollIntoView`, `measure`, `select`, `requestSubmit`, `showPicker`,
 * `waitForAnimations`) and `waitForPaint`.
 *
 * A Command runs once the render the issuing `update` caused is committed.
 * The synchronous element ref operations (`focus`, `blur`, `scrollIntoView`,
 * `measure`, `select`, `requestSubmit` and `showPicker`) run in the committing
 * task rather than waiting for the scheduler, so focus and DOM state are
 * current before the next browser event. Element operations reach the element
 * through `Html.Host`, which a test on `TestHost` fakes with
 * `Layer.succeed(Html.Host, ...)`. `waitForAnimations` reads `getAnimations`
 * on the element directly. It and `waitForPaint` wait for frames on
 * `HtmlSubscription.AnimationFrames`.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Command from "../Command.ts"
import { onCommit } from "../internal/services.ts"
import * as Renderer from "../Renderer.ts"
import * as Html from "./Html.ts"
import * as frames from "./internal/frames.ts"

/**
 * What `focus`, `blur`, `scrollIntoView` and `select` report: whether the
 * ref was rendered.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Found {
  readonly found: boolean
}

const lookup = (
  ref: Renderer.Ref<any>
): Effect.Effect<Option.Option<globalThis.Element>, never, Renderer.Refs> =>
  Renderer.Refs.use((refs) =>
    refs.lookup(ref) as Effect.Effect<Option.Option<globalThis.Element>>
  )

const withElement = <A>(
  ref: Renderer.Ref<any>,
  f: (
    host: Context.Service.Shape<typeof Html.Host>,
    element: globalThis.Element
  ) => A
): Effect.Effect<Option.Option<A>, never, Renderer.Refs | Html.Host> =>
  Effect.flatMap(lookup(ref), (element) =>
    Option.isNone(element)
      ? Effect.succeed(Option.none())
      : Html.Host.useSync((host) => Option.some(f(host, element.value))))

const found = (
  ref: Renderer.Ref<any>,
  f: (
    host: Context.Service.Shape<typeof Html.Host>,
    element: globalThis.Element
  ) => void
): Effect.Effect<Found, never, Renderer.Refs | Html.Host> =>
  Effect.map(
    withElement(ref, f),
    (done): Found => ({ found: Option.isSome(done) })
  )

const FocusOptionsSchema = Schema.Struct({
  preventScroll: Schema.optional(Schema.Boolean)
})
const ScrollOptionsSchema = Schema.Struct({
  behavior: Schema.optional(Schema.Literals(["auto", "instant", "smooth"])),
  block: Schema.optional(
    Schema.Literals(["center", "end", "nearest", "start"])
  ),
  inline: Schema.optional(
    Schema.Literals(["center", "end", "nearest", "start"])
  )
})

const onCommitOptions = <const In extends Command.ArgsInput>(
  args: In
): { readonly args: In } =>
  ({ args, [onCommit]: true }) as { readonly args: In }

/**
 * The Command behind `focus`, for a story's `.resolve(HtmlCommand.Focus, { found })`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Focus: Command.Factory<
  {
    readonly ref: Renderer.Ref<any>
    readonly options?: Html.FocusOptions | undefined
  },
  Found
> = Command.make(
  "HtmlCommand.focus",
  onCommitOptions({
    ref: Renderer.Ref,
    options: Schema.optional(FocusOptionsSchema)
  }),
  ({ options, ref }) =>
    found(ref, (host, element) => host.focus(element, options ?? {}))
)

/**
 * The Command behind `blur`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Blur: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> =
  Command.make(
    "HtmlCommand.blur",
    onCommitOptions({ ref: Renderer.Ref }),
    ({ ref }) => found(ref, (host, element) => host.blur(element))
  )

/**
 * The Command behind `scrollIntoView`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ScrollIntoView: Command.Factory<
  {
    readonly ref: Renderer.Ref<any>
    readonly options?: Html.ScrollOptions | undefined
  },
  Found
> = Command.make(
  "HtmlCommand.scrollIntoView",
  onCommitOptions({
    ref: Renderer.Ref,
    options: Schema.optional(ScrollOptionsSchema)
  }),
  ({ options, ref }) =>
    found(ref, (host, element) => host.scrollIntoView(element, options ?? {}))
)

/**
 * The Command behind `measure`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Measure: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Option.Option<Html.Rect>
> = Command.make(
  "HtmlCommand.measure",
  onCommitOptions({ ref: Renderer.Ref }),
  ({ ref }) => withElement(ref, (host, element) => host.measure(element))
)

/**
 * The Command behind `select`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Select: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Found
> = Command.make(
  "HtmlCommand.select",
  onCommitOptions({ ref: Renderer.Ref }),
  ({ ref }) => found(ref, (host, element) => host.select(element))
)

/**
 * What `requestSubmit` reports: whether the ref was rendered, and whether
 * it had a form to submit.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Submitted extends Found {
  readonly submitted: boolean
}

/**
 * The Command behind `requestSubmit`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const RequestSubmit: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Submitted
> = Command.make(
  "HtmlCommand.requestSubmit",
  onCommitOptions({ ref: Renderer.Ref }),
  ({ ref }) =>
    Effect.map(
      withElement(ref, (host, element) => host.requestSubmit(element)),
      (done): Submitted => ({
        found: Option.isSome(done),
        submitted: Option.getOrElse(done, () => false)
      })
    )
)

/**
 * Focuses the element `ref` names in the committing task once the render the
 * issuing `update` caused is committed, and sends `f`'s message.
 *
 * **Details**
 *
 * A ref that isn't rendered gives `{ found: false }`. The ref resolves within
 * the issuing instance. `Refs` and `Html.Host` are framework services, so
 * this adds nothing to a component's requirements.
 *
 * **Example** (Focusing the new-todo field after adding)
 *
 * ```ts
 * import { Html, HtmlCommand } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ SubmittedForm: {}, CompletedFocusNewTodo: {} })
 * const NewTodo = Html.ref("NewTodo", "input")
 *
 * const command = HtmlCommand.focus(NewTodo, () => Message.CompletedFocusNewTodo())
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const focus = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: Html.FocusOptions
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Focus.make(options === undefined ? { ref } : { ref, options }), f)

/**
 * Takes focus away from the element `ref` names in the committing task once
 * the render commits, and sends `f`'s message.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const blur = <N extends HTMLElement | SVGElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Blur.make({ ref }), f)

/**
 * Scrolls the element `ref` names into view in the committing task once the
 * render commits, and sends `f`'s message.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const scrollIntoView = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg,
  options?: Html.ScrollOptions
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(
    ScrollIntoView.make(options === undefined ? { ref } : { ref, options }),
    f
  )

/**
 * Measures the element `ref` names in the committing task once the render
 * commits, and sends `f`'s message with its box, or `Option.none()` when the
 * ref isn't rendered.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const measure = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (rect: Option.Option<Html.Rect>) => Msg
): Command.Mapped<
  Command.Issued<
    Option.Option<Html.Rect>,
    never,
    Option.Option<Html.Rect>,
    "Effect"
  >,
  Msg
> => Command.map(Measure.make({ ref }), f)

/**
 * Selects all the text in the `input` or `textarea` `ref` names in the
 * committing task once the render the issuing `update` caused is committed,
 * and sends `f`'s message.
 *
 * **Details**
 *
 * It doesn't move focus: issue `focus` for that. The browser host first
 * writes the element's controlled `value` if the element shows something
 * else, such as a character `update` rejected, since writing it afterward
 * would drop the selection.
 *
 * **Example** (Selecting a field's text once it has focus)
 *
 * ```ts
 * import { Html, HtmlCommand } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ FocusedAmount: {}, CompletedSelectAmount: {} })
 * const Amount = Html.ref("Amount", "input")
 *
 * const command = HtmlCommand.select(Amount, () => Message.CompletedSelectAmount())
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const select = <N extends HTMLInputElement | HTMLTextAreaElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Select.make({ ref }), f)

/**
 * Submits the form of the element `ref` names in the committing task once the
 * render commits, as a press on its submit button would, and sends `f`'s
 * message.
 *
 * **Details**
 *
 * `ref` names a `form`, or a control that belongs to one, by nesting or by
 * its `form` attribute. The browser validates the form first, unless it has
 * `novalidate`, and then fires `submit`, which reaches the form's
 * `submit` handler. `submitted` is `false` when the element has no form.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const requestSubmit = <N extends HTMLElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Submitted) => Msg
): Command.Mapped<Command.Issued<Submitted, never, Submitted, "Effect">, Msg> =>
  Command.map(RequestSubmit.make({ ref }), f)

/**
 * What `showPicker` reports: whether the ref was rendered, and whether the
 * browser opened its picker.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Opened extends Found {
  readonly opened: boolean
}

/**
 * The Command behind `showPicker`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ShowPicker: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Opened
> = Command.make(
  "HtmlCommand.showPicker",
  onCommitOptions({ ref: Renderer.Ref }),
  ({ ref }) =>
    Effect.map(
      withElement(ref, (host, element) => host.showPicker(element)),
      (done): Opened => ({
        found: Option.isSome(done),
        opened: Option.getOrElse(done, () => false)
      })
    )
)

/**
 * Opens the picker of the `input` or `select` `ref` names in the committing
 * task once the render commits, as a click on it would, and sends `f`'s
 * message.
 *
 * **When to use**
 *
 * Use to open a file input the view renders from a menu item or a keyboard
 * shortcut. The files arrive in the input's `change` handler. To choose files
 * without rendering an input, use `HtmlFiles.pick`.
 *
 * **Details**
 *
 * It calls the element's `showPicker()`, or `click()` on a file input in a
 * browser without it. `opened` is `false` when the browser refuses, as it
 * does outside a user's action and for a disabled element. A Command issued
 * from a click or key press runs within that action.
 *
 * **Example** (Opening a rendered file input's picker)
 *
 * ```ts
 * import { Html, HtmlCommand } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ CompletedShowPicker: { opened: Schema.Boolean } })
 * const Attachment = Html.ref("Attachment", "input")
 *
 * const command = HtmlCommand.showPicker(Attachment, ({ opened }) => Message.CompletedShowPicker({ opened }))
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const showPicker = <N extends HTMLInputElement | HTMLSelectElement, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Opened) => Msg
): Command.Mapped<Command.Issued<Opened, never, Opened, "Effect">, Msg> =>
  Command.map(ShowPicker.make({ ref }), f)

/**
 * The Command behind `waitForPaint`, for a story's
 * `.resolve(HtmlCommand.WaitForPaint, undefined)`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const WaitForPaint: Command.Factory<{}, void> = Command.make(
  "HtmlCommand.waitForPaint",
  { args: {} },
  () => Effect.andThen(frames.nextFrame, frames.nextFrame)
)

/**
 * Waits two animation frames after the render commit, then sends `f`'s message.
 *
 * **When to use**
 *
 * Use when an enter transition needs the from-state (such as a
 * `data-starting-style` attribute) to paint before `update` applies the
 * to-state. `measure` and `scrollIntoView` already run after commit and do not
 * need this wait.
 *
 * **Details**
 *
 * Like every Command, this starts after the render commit, then waits two
 * frames on `HtmlSubscription.AnimationFrames`: the renderer flushes in a
 * microtask rather than inside `requestAnimationFrame`, so the first frame
 * arrives before the commit's paint.
 *
 * **Gotchas**
 *
 * The default `HtmlSubscription.AnimationFrames` never fires. A whole-app test
 * provides `TestAnimationFrames.layer` and fires two frames; a `Story` or
 * `HtmlScene` resolves the Command with
 * `.resolve(HtmlCommand.WaitForPaint, undefined)`.
 *
 * **Example** (Triggering an enter transition after paint)
 *
 * ```ts
 * import { HtmlCommand } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 *
 * const Message = UiSchema.TaggedEnum({ Opened: {}, Painted: {} })
 *
 * const command = HtmlCommand.waitForPaint(() => Message.Painted())
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const waitForPaint = <Msg>(
  f: () => Msg
): Command.Mapped<Command.Issued<void, never, void, "Effect">, Msg> =>
  Command.map(WaitForPaint.make({}), f)

const finite = (animation: Animation): boolean => {
  const end = animation.effect?.getComputedTiming().endTime
  return typeof end === "number" && Number.isFinite(end)
}

const settled: Found = { found: true }

// Cancellation rejects `finished`; wait a frame before looking for replacements.
const animationsSettled = (element: globalThis.Element): Effect.Effect<Found> =>
  Effect.suspend(() => {
    const running =
      element.isConnected && typeof element.getAnimations === "function"
        ? element.getAnimations({ subtree: true }).filter(finite)
        : []
    if (running.length === 0) return Effect.succeed(settled)
    return Effect.flatMap(
      Effect.promise(() =>
        Promise.all(running.map((animation) => animation.finished)).then(
          () => true,
          () => false
        )
      ),
      (finished) =>
        finished || !element.isConnected
          ? Effect.succeed(settled)
          : Effect.andThen(frames.nextFrame, animationsSettled(element))
    )
  })

/**
 * The Command behind `waitForAnimations`, for a story's
 * `.resolve(HtmlCommand.WaitForAnimations, { found })`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const WaitForAnimations: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Found
> = Command.make(
  "HtmlCommand.waitForAnimations",
  { args: { ref: Renderer.Ref } },
  ({ ref }) =>
    Effect.flatMap(lookup(ref), (element) =>
      Option.isNone(element)
        ? Effect.succeed<Found>({ found: false })
        : animationsSettled(element.value))
)

/**
 * Waits for finite animations on `ref`'s element and its descendants, then sends
 * `f`'s message.
 *
 * **When to use**
 *
 * Use to keep an exiting element mounted until its exit transition finishes,
 * then remove it in `update`.
 *
 * **Details**
 *
 * After commit, it awaits `.finished` on the finite animations returned by
 * `element.getAnimations({ subtree: true })`, including CSS transitions.
 * Infinite animations, such as spinners, are skipped. If an animation is
 * cancelled or replaced, it collects animations again on the next
 * `HtmlSubscription.AnimationFrames` frame, unless the element has disconnected.
 *
 * A missing ref returns `{ found: false }`. An element with no finite animations
 * or no `getAnimations` returns `{ found: true }`. If an animation rejects after
 * the element disconnects, it returns `{ found: true }` without waiting a frame.
 *
 * **Example** (Keeping a panel mounted during its exit animation)
 *
 * ```ts
 * import { Html, HtmlCommand } from "@effect/ui/html"
 * import { UiSchema } from "@effect/ui"
 * import { Schema } from "effect"
 *
 * const Panel = Html.ref("Panel", "div")
 * const Message = UiSchema.TaggedEnum({
 *   Opened: {},
 *   Closed: {},
 *   ExitSettled: { generation: Schema.Number }
 * })
 *
 * const Drawer = Html.component({
 *   name: "Drawer",
 *   model: Schema.Struct({
 *     phase: Schema.Literals(["closed", "open", "closing"]),
 *     generation: Schema.Number
 *   }),
 *   message: Message
 * }).make({
 *   init: () => ({ phase: "closed" as const, generation: 0 }),
 *   update: {
 *     Opened: ($) => $.evolve({ phase: "open" as const }),
 *     Closed: ($) => {
 *       if ($.model.phase !== "open") return $.model
 *       const generation = $.model.generation + 1
 *       return $.set({ phase: "closing" as const, generation }).run(
 *         HtmlCommand.waitForAnimations(Panel, () =>
 *           Message.ExitSettled({ generation })
 *         )
 *       )
 *     },
 *     // Ignore a stale settle if the drawer reopened or started a newer close.
 *     ExitSettled: ($, { generation }) =>
 *       $.model.phase === "closing" && generation === $.model.generation
 *         ? $.evolve({ phase: "closed" as const })
 *         : $.model
 *   },
 *   view: (h, { phase }) =>
 *     phase === "closed"
 *       ? h.div()
 *       : h.div.ref(Panel).attr(
 *         "data-ending-style",
 *         phase === "closing" ? "" : undefined
 *       )
 * })
 * ```
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const waitForAnimations = <N extends globalThis.Element, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(WaitForAnimations.make({ ref }), f)
