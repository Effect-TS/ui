import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import { heldBy, hold } from "./closing.ts"
import { follow, owned, servicesOf, withScheduler } from "./fork.ts"
import * as Kernel from "./kernel.ts"
import { scopeAddFinalizerUnsafe } from "./scope.ts"
import { serverFailure } from "./slotStatus.ts"

type Draft = Parameters<Kernel.Recorder>[1]
type Built = Exit.Exit<Context.Context<any>, unknown>

type Keys = ReadonlyArray<unknown> | { readonly defect: unknown }

const noKeys: Keys = []

const readKeys = (inst: Kernel.Instance): Keys => {
  try {
    return (inst.component as unknown as Component.Any).layerKeys!.map((key) =>
      key(inst.props, inst.model)
    )
  } catch (defect) {
    return { defect }
  }
}

const sameKeys = (a: Keys, b: Keys): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.every((key, index) => Equal.equals(key, b[index]))
    : !Array.isArray(a) && !Array.isArray(b)

const envOf = (parent: Kernel.Env): Kernel.Env => ({
  ctx: undefined,
  cause: undefined,
  waiting: [],
  parent
})

const whenSettled = (
  env: Kernel.Env,
  ready: (ctx: Context.Context<any>) => void,
  failed: (cause: Cause.Cause<unknown>) => void
): void => {
  if (env.ctx !== undefined) ready(env.ctx)
  else if (env.cause !== undefined) failed(env.cause)
  else env.waiting.push(() => whenSettled(env, ready, failed))
}

const settle = (
  env: Kernel.Env,
  ctx: Context.Context<any> | undefined,
  cause?: Cause.Cause<unknown>
): void => {
  env.ctx = ctx
  env.cause = cause
  for (const wake of env.waiting.splice(0)) wake()
}

const track = (
  fibers: Set<Fiber.Fiber<any, any>>,
  fiber: Fiber.Fiber<any, any>
): void => {
  fibers.add(fiber)
  fiber.addObserver(() => fibers.delete(fiber))
}

const interrupter = -0x4c41

const runNow = (
  tree: Kernel.Tree,
  context: Context.Context<any>,
  effect: Effect.Effect<unknown>
): Fiber.Fiber<unknown> | undefined => {
  const fiber = Effect.runForkWith(withScheduler(context))(effect, {
    uninterruptible: true
  })
  if (fiber.pollUnsafe() !== undefined) return undefined
  track(tree.closing ??= new Set(), fiber)
  return owned(tree, fiber)
}

const addFinalizer = (
  tree: Kernel.Tree,
  context: Context.Context<any>,
  scope: Scope.Scope,
  finalizer: Effect.Effect<unknown>
): void => {
  if (scope.state._tag === "Closed") runNow(tree, context, finalizer)
  else scopeAddFinalizerUnsafe(scope, {}, () => finalizer)
}

const build = (
  tree: Kernel.Tree,
  layer: Layer.Layer<any, any, any>,
  context: Context.Context<any>,
  memoMap: Layer.MemoMap | undefined,
  scope: Scope.Scope,
  onExit: (exit: Built) => void
): void => {
  const cleanups = new Set<Fiber.Fiber<any, any>>()
  addFinalizer(
    tree,
    context,
    scope,
    Effect.suspend(() => Fiber.awaitAll([...cleanups]))
  )
  const attempt = (again: boolean): void => {
    const buildScope = Scope.forkUnsafe(scope, "sequential")
    const made = memoMap === undefined
      ? Layer.buildWithScope(layer, buildScope)
      : Layer.buildWithMemoMap(layer, memoMap, buildScope)
    let waiting = again
    const fiber = Effect.runForkWith(withScheduler(context))(
      again
        ? Effect.andThen(
          Effect.andThen(
            Effect.yieldNow,
            Effect.suspend(() =>
              Fiber.awaitAll([...(tree.closing ??= new Set())])
            )
          ),
          Effect.suspend(() => {
            waiting = false
            return made
          })
        )
        : made
    )
    const done = (exit: Built): void => {
      if (Exit.isSuccess(exit)) return onExit(exit)
      const closed = runNow(tree, context, Scope.close(buildScope, Exit.void))
      if (closed !== undefined) track(cleanups, closed)
      if (waiting) return
      if (
        scope.state._tag === "Closed" || !Cause.hasInterruptsOnly(exit.cause) ||
        !Cause.interruptors(exit.cause).has(interrupter)
      ) return onExit(exit)
      attempt(true)
    }
    const exit = fiber.pollUnsafe()
    if (exit !== undefined) return done(exit)
    const then = follow(tree)
    fiber.addObserver((exit) => then(() => done(exit)))
    addFinalizer(
      tree,
      context,
      buildScope,
      Effect.sync(() => {
        if (fiber.pollUnsafe() !== undefined) return
        track(tree.closing ??= new Set(), fiber)
        track(cleanups, fiber)
        fiber.interruptUnsafe(interrupter)
      })
    )
  }
  attempt(false)
}

interface Shared {
  readonly env: Kernel.Env
  readonly scope: Scope.Closeable
  refs: number
}

const sharedBuilds = new WeakMap<
  Kernel.Env,
  Map<Layer.Layer<any, any, any>, Shared>
>()

const memoMaps = new WeakMap<Kernel.Env, Layer.MemoMap>()

const memoMapOf = (
  env: Kernel.Env,
  ctx: Context.Context<any>
): Layer.MemoMap => {
  let memoMap = memoMaps.get(env)
  if (memoMap === undefined) {
    memoMaps.set(env, memoMap = Layer.CurrentMemoMap.forkOrCreate(ctx))
  }
  return memoMap
}

const counted = (
  tree: Kernel.Tree,
  context: Context.Context<any>,
  env: Kernel.Env,
  scope: Scope.Scope
) => {
  const stamp = { flush: tree.flush?.() ?? 0 }
  const building = tree.building ??= new Set()
  building.add(stamp)
  const done = () => building.delete(stamp)
  const settled = () => {
    if (building.delete(stamp)) Kernel.wake(tree)
  }
  whenSettled(env, settled, settled)
  addFinalizer(tree, context, scope, Effect.sync(done))
  return done
}

interface Retired {
  readonly scope: Scope.Closeable
  readonly waits: Array<Fiber.Fiber<unknown, unknown>>
}

const offServer = new WeakSet<Kernel.Env>()

const provides = new WeakMap<Kernel.Instance, Provide>()

class Provide {
  readonly inst: Kernel.Instance
  readonly component: Component.Any
  readonly parent: Kernel.Env
  readonly context: Context.Context<any>
  scope: Scope.Closeable = Scope.makeUnsafe("sequential")
  booting = true
  failedEarly: Cause.Cause<unknown> | undefined = undefined
  ready = false
  shared: Shared | undefined = undefined
  keys: Keys = noKeys
  model: unknown = undefined
  props: unknown = undefined
  held: Array<() => void> = []
  retired: Retired | undefined = undefined
  readonly releases = new Set<Fiber.Fiber<unknown>>()
  constructor(inst: Kernel.Instance) {
    this.inst = inst
    this.component = inst.component as unknown as Component.Any
    this.parent = inst.env
    this.context = servicesOf(inst.env)
  }
  log(draft: Draft): void {
    this.inst.tree.log?.(this.inst, draft)
  }
  start(
    own: Kernel.Env,
    status: "Pending" | "Awaiting" | "Rebuilding",
    unsettled: boolean
  ): void {
    const inst = this.inst
    const tree = inst.tree
    const current = () => !inst.closed && inst.env === own
    let pending = false
    let done: (() => void) | undefined
    const stamp = tree.builds = (tree.builds ?? 0) + 1
    const failed = (cause: Cause.Cause<unknown>) => {
      done?.()
      tree.failedBuild = Math.max(tree.failedBuild ?? 0, stamp)
      if (current()) this.failed(own, cause)
    }
    const shared = this.shared
    if (shared !== undefined) {
      whenSettled(own, () => {
        if (current() && pending) this.log({ _tag: "LayerReady" })
        this.ready = true
      }, failed)
    } else {
      const scope = this.scope
      whenSettled(this.parent, (parentCtx) => {
        if (!current()) return
        let layer: Layer.Layer<any, any, any>
        try {
          const keys = this.keys
          if (!Array.isArray(keys)) {
            throw (keys as { readonly defect: unknown }).defect
          }
          layer = this.component.layer!(inst.props, keys)
        } catch (defect) {
          return failed(Cause.die(defect))
        }
        build(tree, layer, parentCtx, undefined, scope, (exit) => {
          if (!current()) return
          if (Exit.isFailure(exit)) return failed(exit.cause)
          if (pending || unsettled) this.log({ _tag: "LayerReady" })
          this.ready = true
          settle(own, Context.merge(parentCtx, exit.value))
        })
      }, failed)
    }
    if (
      current() && own.ctx === undefined && own.cause === undefined &&
      this.failedEarly === undefined
    ) {
      pending = true
      this.log({ _tag: "LayerPending", status })
      done = counted(tree, this.context, own, shared?.scope ?? this.scope)
    }
  }
  failed(own: Kernel.Env, cause: Cause.Cause<unknown>): void {
    const inst = this.inst
    const tree = inst.tree
    this.ready = false
    const handle = this.component.layerFailure
    const server = tree.host.server !== undefined && handle !== undefined
    this.log(
      server
        ? { _tag: "LayerFailed", cause, redacted: true }
        : { _tag: "LayerFailed", cause }
    )
    if (handle === undefined) {
      if (this.booting) this.failedEarly = cause
      else {tree.schedule(() =>
          inst.env === own && Kernel.fail(inst, "layer", cause)
        )}
      return
    }
    if (server) own.cause = serverFailure()
    if (own.cause === undefined) settle(own, undefined, cause)
    tree.schedule(() => {
      if (inst.env === own) {
        inst.fire(handle, AsyncResult.failure(cause), undefined, "onFailure")
      }
    })
  }
  hold(go: () => void): boolean {
    const inst = this.inst
    if (inst.model === this.model && inst.props === this.props) return false
    this.held.push(go)
    return true
  }
  reselect(): void {
    const inst = this.inst
    if (inst.model === this.model && inst.props === this.props) return
    this.model = inst.model
    this.props = inst.props
    const keys = readKeys(inst)
    const changed = !sameKeys(this.keys, keys)
    let unsettled = false
    if (changed) {
      this.keys = keys
      unsettled = this.swap()
    }
    const held = this.held
    this.held = []
    for (const go of held) go()
    if (!changed) return
    const own = inst.env
    const release = () => this.releaseRetired()
    whenSettled(own, release, release)
    this.start(own, "Rebuilding", unsettled)
    inst.component["~sync"]?.(inst)
  }
  swap(): boolean {
    const inst = this.inst
    const previous = inst.env
    inst.env = envOf(this.parent)
    const waits: Array<Fiber.Fiber<unknown, unknown>> = []
    if (inst.swaps !== undefined) { for (const swap of inst.swaps) swap(waits) }
    Kernel.clear(inst)
    waits.push(...heldBy(inst))
    const retired = { scope: this.scope, waits }
    if (previous.ctx !== undefined && this.retired === undefined) {
      this.retired = retired
    } else {
      this.release({ scope: this.scope, waits: [] })
      this.retired?.waits.push(...waits)
    }
    this.scope = Scope.makeUnsafe("sequential")
    const wasReady = this.ready
    this.ready = false
    return !wasReady
  }
  releaseRetired(): void {
    const retired = this.retired
    if (retired === undefined) return
    this.retired = undefined
    this.release(retired)
  }
  release(retired: Retired): void {
    const fiber = runNow(this.inst.tree, this.context, releaseOf(retired))
    if (fiber !== undefined) track(this.releases, fiber)
  }
  close(): void {
    const inst = this.inst
    const waits = heldBy(inst)
    const retired = this.retired
    this.retired = undefined
    const shared = this.shared
    const fiber = runNow(
      inst.tree,
      this.context,
      Effect.andThen(
        Fiber.awaitAll(waits),
        Effect.suspend(() =>
          Effect.andThen(
            shared === undefined
              ? Scope.close(this.scope, Exit.void)
              : releaseShared(this.parent, this.component, shared),
            Effect.andThen(
              retired === undefined ? Effect.void : releaseOf(retired),
              Effect.suspend(() => Fiber.awaitAll([...this.releases]))
            )
          )
        )
      )
    )
    if (fiber !== undefined) hold(inst.parent, [fiber])
  }
}

const releaseOf = ({ scope, waits }: Retired): Effect.Effect<void> =>
  Effect.andThen(Fiber.awaitAll(waits), Scope.close(scope, Exit.void))

const acquireShared = (
  tree: Kernel.Tree,
  parent: Kernel.Env,
  layer: Layer.Layer<any, any, any>
): Shared => {
  let byLayer = sharedBuilds.get(parent)
  if (byLayer === undefined) sharedBuilds.set(parent, byLayer = new Map())
  const found = byLayer.get(layer)
  if (found !== undefined) {
    found.refs++
    return found
  }
  const entry: Shared = {
    env: envOf(parent),
    scope: Scope.makeUnsafe("sequential"),
    refs: 1
  }
  byLayer.set(layer, entry)
  whenSettled(parent, (parentCtx) => {
    build(
      tree,
      layer,
      parentCtx,
      memoMapOf(parent, parentCtx),
      entry.scope,
      (exit) => {
        if (Exit.isSuccess(exit)) {
          return settle(entry.env, Context.merge(parentCtx, exit.value))
        }
        if (byLayer!.get(layer) === entry) {
          byLayer!.delete(layer)
        }
        settle(entry.env, undefined, exit.cause)
      }
    )
  }, (cause) => settle(entry.env, undefined, cause))
  return entry
}

const releaseShared = (
  parent: Kernel.Env,
  component: Component.Any,
  entry: Shared
): Effect.Effect<void> => {
  if (--entry.refs > 0) return Effect.void
  const byLayer = sharedBuilds.get(parent)
  if (byLayer?.get(component.sharedLayer!) === entry) {
    byLayer.delete(component.sharedLayer!)
  }
  return Scope.close(entry.scope, Exit.void)
}

/** @internal */
export const boot = (inst: Kernel.Instance): void => {
  const tree = inst.tree
  if (tree.host.inert) {
    inst.env = envOf(inst.env)
    return
  }
  const server = tree.host.server
  if (
    server !== undefined &&
    (!(inst.component as unknown as Component.Any).layerOnServer ||
      offServer.has(inst.env))
  ) {
    offServer.add(inst.env = envOf(inst.env))
    return server.defer(inst)
  }
  const provide = new Provide(inst)
  const component = provide.component
  ;(inst.closers ??= []).push(() => provide.close())
  if (component.layerKeys !== undefined) {
    provide.model = inst.model
    provide.props = inst.props
    provide.keys = readKeys(inst)
    provides.set(inst, provide)
    inst.hold = (go) => provide.hold(go)
  }
  const served = tree.served?.(inst)
  const sharedLayer = component.sharedLayer
  if (served === "Failed") {
    const cause = serverFailure()
    provide.log({ _tag: "LayerFailed", cause, redacted: true })
    settle(inst.env = envOf(provide.parent), undefined, cause)
  } else if (sharedLayer !== undefined) {
    provide.shared = acquireShared(tree, provide.parent, sharedLayer)
    inst.env = provide.shared.env
  } else inst.env = envOf(provide.parent)
  if (served !== "Failed") {
    provide.start(inst.env, served === "Ready" ? "Awaiting" : "Pending", false)
  }
  provide.booting = false
  if (provide.failedEarly !== undefined) {
    Kernel.fail(inst, "layer", provide.failedEarly)
  }
}

/** @internal */
export const reselect = (inst: Kernel.Instance): void => {
  provides.get(inst)?.reselect()
}
