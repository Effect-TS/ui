/**
 * Imperative Commands for OpenTUI renderables and the terminal session:
 * `focus`, `blur`, `scrollTo`, `scrollBy`, `measure`, and `quit`.
 *
 * Commands run through `OpenTui.Host` and `Renderer.Refs`, both framework
 * services, so issuing them adds no requirements to a component.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as OT from "@opentui/core"
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as OpenTui from "./OpenTui.ts"

/**
 * Result of ref Commands that perform an action: whether the ref was rendered.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Found {
  readonly found: boolean
}

const ScrollPositionSchema = Schema.Union([
  Schema.Number,
  Schema.Struct({ x: Schema.Number, y: Schema.Number })
])

const withNode = <N, A>(
  ref: Renderer.Ref<N>,
  f: (host: Context.Service.Shape<typeof OpenTui.Host>, node: N) => A
): Effect.Effect<Option.Option<A>, never, Renderer.Refs | OpenTui.Host> =>
  Renderer.Refs.use((refs) =>
    Effect.flatMap(refs.lookup(ref), (node) =>
      Option.isNone(node)
        ? Effect.succeed(Option.none())
        : OpenTui.Host.useSync((host) => Option.some(f(host, node.value))))
  )

const found = <N>(
  ref: Renderer.Ref<N>,
  f: (host: Context.Service.Shape<typeof OpenTui.Host>, node: N) => void
): Effect.Effect<Found, never, Renderer.Refs | OpenTui.Host> =>
  Effect.map(withNode(ref, f), (done): Found => ({ found: Option.isSome(done) }))

/**
 * The Command definition behind {@link focus}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Focus: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> =
  Command.make(
    "OpenTuiCommand.focus",
    { args: { ref: Renderer.Ref } },
    ({ ref }) => found(ref, (host, node) => host.focus(node as OT.Renderable))
  )

/**
 * The Command definition behind {@link blur}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Blur: Command.Factory<{ readonly ref: Renderer.Ref<any> }, Found> =
  Command.make(
    "OpenTuiCommand.blur",
    { args: { ref: Renderer.Ref } },
    ({ ref }) => found(ref, (host, node) => host.blur(node as OT.Renderable))
  )

/**
 * The Command definition behind {@link scrollTo}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ScrollTo: Command.Factory<
  {
    readonly ref: Renderer.Ref<any>
    readonly position: OpenTui.ScrollPosition
  },
  Found
> = Command.make(
  "OpenTuiCommand.scrollTo",
  { args: { ref: Renderer.Ref, position: ScrollPositionSchema } },
  ({ position, ref }) =>
    found(ref, (host, node) =>
      host.scrollTo(node as OT.ScrollBoxRenderable, position))
)

/**
 * The Command definition behind {@link scrollBy}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const ScrollBy: Command.Factory<
  {
    readonly ref: Renderer.Ref<any>
    readonly delta: OpenTui.ScrollPosition
  },
  Found
> = Command.make(
  "OpenTuiCommand.scrollBy",
  { args: { ref: Renderer.Ref, delta: ScrollPositionSchema } },
  ({ delta, ref }) =>
    found(ref, (host, node) =>
      host.scrollBy(node as OT.ScrollBoxRenderable, delta))
)

/**
 * The Command definition behind {@link measure}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Measure: Command.Factory<
  { readonly ref: Renderer.Ref<any> },
  Option.Option<OpenTui.Rect>
> = Command.make(
  "OpenTuiCommand.measure",
  { args: { ref: Renderer.Ref } },
  ({ ref }) => withNode(ref, (host, node) => host.measure(node as OT.Renderable))
)

/**
 * The Command definition behind {@link quit}.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Quit: Command.Factory<{}, Component.Noop> = Command.make(
  "OpenTuiCommand.quit",
  { args: {} },
  () =>
    OpenTui.Host.useSync((host) => {
      host.quit()
      return Component.noop
    })
)

/**
 * Focuses the renderable named by `ref` after commit.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const focus = <N extends OT.Renderable, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Focus.make({ ref }), f)

/**
 * Blurs the renderable named by `ref` after commit.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const blur = <N extends OT.Renderable, Msg>(
  ref: Renderer.Ref<N>,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(Blur.make({ ref }), f)

/**
 * Scrolls the `scrollbox` named by `ref` to `position`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const scrollTo = <N extends OT.ScrollBoxRenderable, Msg>(
  ref: Renderer.Ref<N>,
  position: OpenTui.ScrollPosition,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(ScrollTo.make({ ref, position }), f)

/**
 * Scrolls the `scrollbox` named by `ref` by `delta`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const scrollBy = <N extends OT.ScrollBoxRenderable, Msg>(
  ref: Renderer.Ref<N>,
  delta: OpenTui.ScrollPosition,
  f: (result: Found) => Msg
): Command.Mapped<Command.Issued<Found, never, Found, "Effect">, Msg> =>
  Command.map(ScrollBy.make({ ref, delta }), f)

/**
 * Measures the layout bounds of the renderable named by `ref`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const measure = <N extends OT.Renderable, Msg>(
  ref: Renderer.Ref<N>,
  f: (rect: Option.Option<OpenTui.Rect>) => Msg
): Command.Mapped<
  Command.Issued<
    Option.Option<OpenTui.Rect>,
    never,
    Option.Option<OpenTui.Rect>,
    "Effect"
  >,
  Msg
> => Command.map(Measure.make({ ref }), f)

/**
 * Destroys the active OpenTUI renderer, ending `OpenTuiHost.run`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const quit = (): Command.Issued<
  Component.Noop,
  never,
  Component.Noop,
  "Effect"
> => Quit.make({})
