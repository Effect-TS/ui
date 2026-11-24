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
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import * as OpenTui from "../OpenTui.ts"
import * as OpenTuiHost from "../OpenTuiHost.ts"
import * as OpenTuiSubscription from "../OpenTuiSubscription.ts"

/**
 * Options for {@link mount} and {@link layer}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface TestOptions extends TestRendererOptions {
  readonly renderables?:
    | Readonly<Record<string, OpenTuiHost.RenderableConstructor>>
    | undefined
}

/**
 * Handle to a component mounted on OpenTUI's test renderer.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountedApp<out Model, in Msg> {
  readonly root: Renderer.Root<Model, Msg>
  readonly setup: TestRendererSetup
  readonly titles: ReadonlyArray<string>
  readonly settle: Effect.Effect<void>
  readonly render: Effect.Effect<string>
  readonly captureFrame: () => string
  readonly pressKey: (
    key: string,
    modifiers?: {
      readonly shift?: boolean
      readonly ctrl?: boolean
      readonly meta?: boolean
    }
  ) => Effect.Effect<void>
  readonly pressArrow: (
    direction: "up" | "down" | "left" | "right",
    modifiers?: {
      readonly shift?: boolean
      readonly ctrl?: boolean
      readonly meta?: boolean
    }
  ) => Effect.Effect<void>
  readonly pressEnter: Effect.Effect<void>
  readonly pressEscape: Effect.Effect<void>
  readonly typeText: (text: string) => Effect.Effect<void>
  readonly click: (x: number, y: number) => Effect.Effect<void>
  readonly resize: (width: number, height: number) => Effect.Effect<void>
}

const drainTurn: Effect.Effect<void> = Effect.promise(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve))
  }
})

const drainMicrotasks: Effect.Effect<void> = Effect.promise(async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => queueMicrotask(resolve))
  }
})

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
): Layer.Layer<Renderer.Renderer | OpenTui.Host> =>
  Layer.effectContext(
    Effect.gen(function*() {
      const { renderables, ...rendererOptions } = options ?? {}
      const setup = yield* Effect.acquireRelease(
        Effect.promise(() =>
          createTestRenderer({
            width: 80,
            height: 24,
            ...rendererOptions
          })
        ),
        (s) => Effect.promise(() => s.dispose())
      )
      return Context.make(Renderer.Renderer, {
        host: OpenTuiHost.makeHost(setup.renderer, { renderables })
      }).pipe(
        Context.add(OpenTui.Host, OpenTuiHost.makeHostService(setup.renderer)),
        Context.add(
          OpenTuiSubscription.GlobalEvents,
          OpenTuiHost.makeGlobalEvents(setup.renderer)
        )
      )
    })
  )

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
  MountedApp<Model, Msg>,
  never,
  Exclude<R | RP, OpenTui.Host> | Scope.Scope
> =>
  Effect.gen(function*() {
    const { renderables, ...rendererOptions } = options ?? {}
    const titles: Array<string> = []
    const setup = yield* Effect.acquireRelease(
      Effect.promise(() =>
        createTestRenderer({
          width: 80,
          height: 24,
          ...rendererOptions
        })
      ),
      (s) => Effect.promise(() => s.dispose())
    )
    const hostContext = Context.make(Renderer.Renderer, {
      host: OpenTuiHost.makeHost(setup.renderer, {
        renderables,
        onTitle: (title) => {
          titles.push(title)
        }
      })
    }).pipe(
      Context.add(OpenTui.Host, OpenTuiHost.makeHostService(setup.renderer)),
      Context.add(
        OpenTuiSubscription.GlobalEvents,
        OpenTuiHost.makeGlobalEvents(setup.renderer)
      )
    )
    const outer = yield* Effect.context<Scope.Scope>()
    const root = yield* Effect.provideContext(
      Renderer.mount(component as any, props as any, setup.renderer.root),
      Context.merge(outer, hostContext)
    )
    const settle = Effect.gen(function*() {
      yield* drainTurn
      if (!setup.renderer.isDestroyed) {
        yield* Effect.promise(() => setup.renderOnce())
      }
      yield* drainTurn
      if (!setup.renderer.isDestroyed) {
        yield* Effect.promise(() => setup.renderOnce())
      }
    })
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
        Effect.andThen(
          Effect.sync(() => setup.mockInput.pressKey(key, modifiers)),
          settle
        ),
      pressArrow: (direction, modifiers) =>
        Effect.andThen(
          Effect.sync(() => setup.mockInput.pressArrow(direction, modifiers)),
          settle
        ),
      pressEnter: Effect.andThen(
        Effect.sync(() => setup.mockInput.pressEnter()),
        settle
      ),
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
      resize: (width, height) =>
        Effect.andThen(
          Effect.sync(() => setup.resize(width, height)),
          settle
        )
    } as MountedApp<Model, Msg>
  }) as any
