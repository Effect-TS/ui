/**
 * SPIKE (EFF-4218), not for release. Layers for `Kernel`, which doesn't import this module: an app that
 * provides no Layer doesn't carry it. `provide` is `Component.provide`, and puts on the component what
 * builds its Layer when an instance starts.
 *
 * Left out: Layers shared between instances, keyed provides and rebuilding. Each instance builds its own.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Scope from "effect/Scope"
import * as Component from "../Component.ts"
import * as Kernel from "./Kernel.ts"

/** Runs `ready` with what the Layers above built, or `failed` with why they didn't. */
const whenSettled = (
  env: Kernel.Env,
  ready: (ctx: Context.Context<any>) => void,
  failed: (exit: Exit.Exit<never, unknown>) => void
): void => {
  if (env.ctx !== undefined) ready(env.ctx)
  else if (env.cause !== undefined) failed(Exit.failCause(env.cause))
  else env.waiting.push(() => whenSettled(env, ready, failed))
}

const boot = (inst: Kernel.Instance): void => {
  const component = inst.component as unknown as Component.Any
  const above = inst.env
  const own: Kernel.Env = { ctx: undefined, cause: undefined, waiting: [] }
  inst.env = own
  const log = inst.tree.log
  const scope = Scope.makeUnsafe("sequential")
  ;(inst.closers ??= []).push(() => {
    Effect.runFork(Scope.close(scope, Exit.void))
  })
  let pending = false
  const settle = (
    exit: Exit.Exit<Context.Context<any>, unknown>,
    parent?: Context.Context<any>
  ): void => {
    if (inst.closed) return
    if (Exit.isSuccess(exit)) {
      if (pending && log !== undefined) log(inst, { _tag: "LayerReady" })
      own.ctx = Context.merge(parent!, exit.value)
    } else {
      const cause = exit.cause
      if (log !== undefined) log(inst, { _tag: "LayerFailed", cause })
      own.cause = cause
      const handle = component.layerFailure
      if (handle === undefined) Kernel.fail(inst, "layer", cause)
      else {queueMicrotask(() =>
          inst.fire(handle, AsyncResult.failure(cause), undefined, "onFailure")
        )}
    }
    for (const wake of own.waiting.splice(0)) wake()
  }
  whenSettled(above, (parent) => {
    if (inst.closed) return
    let layer: Layer.Layer<any, any, any>
    try {
      layer = component.layer!(inst.props, [])
    } catch (defect) {
      return settle(Exit.die(defect))
    }
    Effect.runForkWith(parent)(Layer.buildWithScope(layer, scope)).addObserver((
      exit
    ) => settle(exit, parent))
  }, settle)
  if (own.ctx === undefined && own.cause === undefined && !inst.closed) {
    pending = true
    if (log !== undefined) {
      log(inst, { _tag: "LayerPending", status: "Pending" })
    }
  }
}

const booted = <C>(component: C): C => {
  ;(component as { boot?: Kernel.Runnable["boot"] }).boot = boot
  return component
}

/**
 * `Component.provide` for a component the kernel runs.
 *
 * @stability experimental
 */
export const provide: typeof Component.provide = ((...args: Array<any>) => {
  const out = (Component.provide as any)(...args)
  return Component.isComponent(args[0])
    ? booted(out)
    : (component: unknown) => booted(out(component))
}) as any
