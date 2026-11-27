/**
 * Integration test harness over `@opentui/core/testing`: mounts an `@effect/ui`
 * component on OpenTUI's native test renderer, drives keyboard/mouse/resize
 * input, and captures rendered terminal frames.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import {
  createTestRenderer,
  type TestRendererOptions,
  type TestRendererSetup
} from "@opentui/core/testing"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as OpenTui from "../OpenTui.ts"
import * as OpenTuiHost from "../OpenTuiHost.ts"

/**
 * Options for {@link mount} and {@link layer}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TestOptions
  extends TestRendererOptions, Pick<OpenTuiHost.MakeHostOptions, "renderables">
{}

interface Modifiers {
  readonly shift?: boolean
  readonly ctrl?: boolean
  readonly meta?: boolean
}

/**
 * Handle to a component mounted on OpenTUI's test renderer.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountedApp<out Model, in Msg, in Props = never> {
  readonly root: Renderer.Root<Model, Msg, Props>
  readonly setup: TestRendererSetup
  readonly titles: ReadonlyArray<string>
  readonly settle: Effect.Effect<void>
  readonly render: Effect.Effect<string>
  readonly captureFrame: () => string
  readonly pressKey: (key: string, modifiers?: Modifiers) => Effect.Effect<void>
  readonly pressArrow: (
    direction: "up" | "down" | "left" | "right",
    modifiers?: Modifiers
  ) => Effect.Effect<void>
  readonly pressEnter: Effect.Effect<void>
  readonly pressEscape: Effect.Effect<void>
  readonly typeText: (text: string) => Effect.Effect<void>
  readonly click: (x: number, y: number) => Effect.Effect<void>
  readonly resize: (width: number, height: number) => Effect.Effect<void>
}

const drainMicrotasks: Effect.Effect<void> = Effect.promise(async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve))
  }
})

const drainTurn: Effect.Effect<void> = Effect.andThen(
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
  drainMicrotasks
)

const acquireSetup = (
  options: TestRendererOptions
): Effect.Effect<TestRendererSetup, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() =>
      createTestRenderer({ width: 80, height: 24, ...options })
    ),
    (setup) => Effect.promise(() => setup.dispose())
  )

/**
 * Provides an OpenTUI test renderer as `Renderer.Renderer`, `OpenTui.Host`,
 * and `OpenTuiSubscription.GlobalEvents`, cleaning it up when the Scope closes.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (
  options?: TestOptions | undefined
): Layer.Layer<Renderer.Renderer | OpenTui.Host> => {
  const { renderables, ...rendererOptions } = options ?? {}
  return Layer.unwrap(
    Effect.map(
      acquireSetup(rendererOptions),
      (setup) => OpenTuiHost.layerFromRenderer(setup.renderer, { renderables })
    )
  )
}

/**
 * Mounts `component` on OpenTUI's native test renderer for the life of the
 * current Scope and returns a {@link MountedApp} harness for driving input and
 * capturing character frames.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiHost.OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: TestOptions | undefined
): Effect.Effect<
  MountedApp<Model, Msg, Props>,
  never,
  Exclude<R | RP, OpenTui.Host> | Scope.Scope
> =>
  Effect.gen(function*() {
    const { renderables, ...rendererOptions } = options ?? {}
    const titles: Array<string> = []
    const setup = yield* acquireSetup(rendererOptions)
    const root = yield* Effect.provide(
      Renderer.mount(component as any, props as any, setup.renderer.root),
      OpenTuiHost.layerFromRenderer(setup.renderer, {
        renderables,
        onTitle: (title) => {
          titles.push(title)
        }
      })
    )
    const pass = Effect.andThen(
      drainTurn,
      Effect.promise(async () => {
        if (!setup.renderer.isDestroyed) await setup.renderOnce()
      })
    )
    const settle = Effect.andThen(pass, pass)
    const act = (f: () => void): Effect.Effect<void> =>
      Effect.andThen(Effect.sync(f), settle)
    yield* settle
    return {
      root,
      setup,
      titles,
      settle,
      render: Effect.andThen(
        settle,
        Effect.sync(() => setup.captureCharFrame())
      ),
      captureFrame: () => setup.captureCharFrame(),
      pressKey: (key, modifiers) =>
        act(() => setup.mockInput.pressKey(key, modifiers)),
      pressArrow: (direction, modifiers) =>
        act(() => setup.mockInput.pressArrow(direction, modifiers)),
      pressEnter: act(() => setup.mockInput.pressEnter()),
      pressEscape: Effect.gen(function*() {
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              let done = false
              const finish = () => {
                if (done) return
                done = true
                clearTimeout(timer)
                setup.renderer.keyInput.off("keypress", finish)
                resolve()
              }
              const timer = setTimeout(finish, 200)
              setup.renderer.keyInput.on("keypress", finish)
              setup.mockInput.pressEscape()
            })
        )
        yield* settle
      }),
      typeText: Effect.fnUntraced(function*(text: string) {
        for (const ch of text) {
          setup.mockInput.pressKey(ch)
          yield* drainMicrotasks
        }
        yield* settle
      }),
      click: (x, y) =>
        Effect.andThen(
          Effect.promise(() => setup.mockMouse.click(x, y)),
          settle
        ),
      resize: (width, height) => act(() => setup.resize(width, height))
    } as MountedApp<Model, Msg, Props>
  }) as any
