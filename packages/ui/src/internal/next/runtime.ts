/**
 * Today's runtime surface on the kernel, for the test project that runs the existing tests against it.
 *
 * @internal
 */
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import type * as Component from "../../Component.ts"
import type * as Renderer from "../../Renderer.ts"
import * as View from "../../View.ts"
import * as Executor from "../executor.ts"
import * as Kernel from "../kernel.ts"
import * as messageLog from "../messageLog.ts"
import * as Recorder from "../recorder.ts"
import type * as runtime from "../runtime.ts"
import * as services from "../services.ts"

/** @internal */
export type Root = runtime.Root

/** @internal */
export type Instance = runtime.Instance

/** @internal */
export { stateCodecOf } from "../stateCodec.ts"

/**
 * No part is headless yet, so no event has owners.
 *
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const eventOwners = (
  _handlers: Readonly<Record<string, unknown>>
): Readonly<Record<string, ReadonlyArray<string>>> => View.noFields

const dispatched = { _tag: "Dispatch" } as const

let sessions = 0

const bridge = (
  host: Renderer.Host<any>,
  step: Recorder.Recording["step"]
): Kernel.Host => ({
  createElement: (tag) => host.createElement(tag),
  createText: (text) => host.createText(text),
  setText: (node, text) => host.setText(node, text),
  setAttr: (node, name, value) => host.setAttr(node, name, value),
  normalizeAttrs: host.normalizeAttrs === undefined
    ? undefined
    : (node, attrs) => host.normalizeAttrs!(node, attrs),
  setProp: (node, name, value) => host.setProp(node, name, value),
  setEvents: (node, rec) => {
    const view = rec.v as View.Element<any, any>
    host.setEvents(
      node,
      view.handlers,
      (event, handler, payload, onMessage) =>
        step(() => {
          const sent = rec.inst.fire(handler, payload, event)
          if (sent) onMessage?.()
          return sent
        }),
      view.eventOptions
    )
    host.events?.listen(view.handlers, view.eventOptions)
  },
  insert: (parent, node, before) =>
    host.insertBefore(parent, node, before ?? undefined),
  remove: (_parent, node) => host.remove(node),
  parentOf: (node) => host.parentOf(node),
  nextOf: (node) => host.nextOf(node) ?? null,
  commit: host.commit === undefined ? undefined : () => host.commit!()
})

interface Options {
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: any
    ) => View.Content<never, any>)
    | undefined
  readonly state?: Renderer.State | undefined
  readonly query?: Renderer.QueryOptions | undefined
  readonly head?: boolean | undefined
  readonly adoptionHead?: boolean | undefined
}

const withProps = <A, E, R>(
  rootProps: unknown,
  f: (props: unknown) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.isEffect(rootProps)
    ? Effect.flatMap(rootProps as Effect.Effect<unknown>, f)
    : f(rootProps)

/**
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const mount = (
  component: Component.Any,
  rootProps: unknown,
  container: unknown,
  options?: Options
): Effect.Effect<
  Root & Renderer.Root<any, any>,
  never,
  Scope.Scope | Renderer.Renderer
> =>
  withProps(
    rootProps,
    (props) =>
      Effect.contextWith(
        (ctx: Context.Context<Scope.Scope | Renderer.Renderer>) => {
          if (options?.state !== undefined) Kernel.notPorted("hydration")
          const root = start(component, props, container, ctx, options)
          return Effect.as(
            Scope.addFinalizer(
              Context.get(ctx, Scope.Scope),
              Effect.sync(root.close)
            ),
            root.root
          )
        }
      )
  )

const start = (
  component: Component.Any,
  props: unknown,
  container: unknown,
  ctx: Context.Context<any>,
  options: Options | undefined
) => {
  const host = Context.get(ctx, services.Renderer).host
  const log = Context.get(ctx, messageLog.MessageLog)
  const executor = Context.get(ctx, Executor.CurrentExecutor)
  const clock = Context.get(ctx, Clock.Clock)
  const forkContext = executor.scheduler === undefined
    ? ctx
    : Context.add(ctx, Scheduler.Scheduler, executor.scheduler)
  const session = `${clock.currentTimeMillisUnsafe().toString(36)}-k${
    (sessions++).toString(36)
  }`
  const emitted: Array<unknown> = []
  let flushes = 0
  const recording = Recorder.make(
    log,
    clock,
    session,
    component.definition.name
  )
  const record: Kernel.Recorder = (inst, draft) => {
    if (
      inst.parent === undefined &&
      (draft._tag === "Update" || draft._tag === "Mounted")
    ) {
      emitted.push(...(draft.events as ReadonlyArray<unknown>))
    }
    recording.record(inst, draft)
  }
  const fallback = options?.fallback
  const kernelRoot = recording.session(() =>
    Kernel.mount(
      component as unknown as Kernel.Runnable,
      props,
      container,
      bridge(host, recording.step),
      {
        context: ctx,
        init: (inst) => {
          const made = inst.component as unknown as Component.Any
          const elements = made.elements()
          if (
            elements !== undefined && host.elements !== "any" &&
            !host.elements.includes(elements.name)
          ) {
            throw new Error(
              `${made.definition.name} renders ${elements.name} elements, and this host shows ${
                host.elements.join(", ")
              }`
            )
          }
          return inst.component.init(inst.props)
        },
        log: record,
        schedule: (task) => {
          const run = recording.later(task)
          executor.schedule(() => {
            flushes++
            run()
          })
        },
        report: (path, where, cause) => {
          Effect.runForkWith(forkContext)(
            Effect.logError(`${path} failed in ${where}`, cause)
          )
        },
        fallback: fallback === undefined ?
          undefined :
          (cause) =>
            View.toNode(
              fallback(
                AsyncResult.failure(cause),
                View.makeHelper({}, component.elements())
              )
            )
      }
    )
  )
  const instance = kernelRoot.instance
  const root = {
    path: instance.path,
    session,
    instance: instance as unknown as Instance,
    emitted,
    model: () => instance.failure === undefined ? instance.model : undefined,
    send: (message: unknown) =>
      recording.step(() => kernelRoot.send(message, dispatched)),
    pending: () => [],
    loads: () => [],
    cache: {
      pending: () => [],
      inspect: () => Kernel.notPorted("queries")
    } as unknown as Root["cache"],
    crashed: () => instance.failure,
    flush: () => flushes,
    buildsPendingSince: () => Kernel.notPorted("Component.provide"),
    head: () => Kernel.notPorted("head"),
    adoptionHead: () => undefined,
    adopted: Effect.void,
    waiting: () => [],
    whenIdle: () => Kernel.notPorted("server rendering"),
    freeze: () => Kernel.notPorted("server rendering")
  } satisfies Root & Renderer.Root<any, any>
  return { root, close: kernelRoot.close }
}

/**
 * Only the kernel test project calls it, through its alias for `internal/runtime.ts`.
 *
 * @internal
 */
// oxlint-disable-next-line effect/no-unused-internal
export const prerender = (
  _component: Component.Any,
  _rootProps: unknown,
  _options: unknown
): Effect.Effect<Renderer.Prerendered<any>> =>
  Effect.sync(() => Kernel.notPorted("server rendering"))
