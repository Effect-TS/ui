/**
 * Starts and stops the Streams an instance of the kernel subscribes to. `Subscription` hands it to
 * `subscriptions.ts` when an app imports it, and a component with `subscriptions` calls it from there,
 * so the kernel never imports it, and an app with no Subscription doesn't carry it.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as MessageLog from "../MessageLog.ts"
import type * as Subscription from "../Subscription.ts"
import { follow, fork } from "./fork.ts"
import type * as Kernel from "./kernel.ts"
import * as services from "./services.ts"
import { duplicateKey } from "./subscriptions.ts"

interface Running {
  /** The name and deps its key was built from, for the entry that logs its stop. */
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  /** The declaration from the latest `subscriptions` result that listed the key. */
  latest: Subscription.Subscription<any, any>
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  detach: (() => void) | undefined
}

const runningOf = new WeakMap<Kernel.Instance, Map<string, Running>>()

const stop = (running: Running): void => {
  running.detach?.()
  running.fiber?.interruptUnsafe()
}

/**
 * Follows the instance's `subscriptions` result: a key that left closes, before a new key starts, so
 * `room:1` and `room:2` are never both connected. A key that stays keeps its Stream.
 *
 * @internal
 */
export const sync = (inst: Kernel.Instance): void => {
  if (inst.closed) return
  let wanted: ReadonlyArray<Subscription.Subscription<any, any>>
  try {
    wanted = (inst.component as unknown as {
      readonly subscriptions: (
        model: unknown,
        props: unknown
      ) => ReadonlyArray<Subscription.Subscription<any, any>>
    }).subscriptions(inst.model, inst.props)
  } catch (error) {
    return inst.tree.ops.fail(inst, "subscription", Cause.die(error))
  }
  const byKey = new Map<string, Subscription.Subscription<any, any>>()
  for (const subscription of wanted) {
    // A key runs one Stream, so the second entry would never start, and nothing would say so.
    if (byKey.has(subscription.key)) {
      return inst.tree.ops.fail(
        inst,
        "subscription",
        Cause.die(duplicateKey(inst.path, subscription.key)),
        undefined,
        undefined,
        subscription.key
      )
    }
    byKey.set(subscription.key, subscription)
  }
  let subscriptions = runningOf.get(inst)
  if (subscriptions === undefined) {
    if (byKey.size === 0) return
    const made = subscriptions = new Map()
    runningOf.set(inst, made)
    ;(inst.closers ??= []).push(() => {
      for (const running of made.values()) stop(running)
      made.clear()
    })
  }
  const log = inst.tree.log
  for (const [key, running] of subscriptions) {
    if (byKey.has(key)) continue
    subscriptions.delete(key)
    log?.(inst, {
      _tag: "SubscriptionStopped",
      key,
      name: running.name,
      deps: running.deps
    })
    stop(running)
  }
  for (const [key, subscription] of byKey) {
    const existing = subscriptions.get(key)
    if (existing !== undefined) {
      existing.latest = subscription
      continue
    }
    const { deps, name } = subscription
    const running: Running = {
      name,
      deps,
      latest: subscription,
      fiber: undefined,
      detach: undefined
    }
    subscriptions.set(key, running)
    log?.(inst, { _tag: "SubscriptionStarted", key, name, deps })
    start(inst, subscriptions, key, running)
  }
}

const start = (
  inst: Kernel.Instance,
  subscriptions: Map<string, Running>,
  key: string,
  running: Running
): void => {
  const current = () => !inst.closed && subscriptions.get(key) === running
  const env = inst.env
  const ctx = env.ctx
  // Its services are still building: it starts once they're there.
  if (ctx === undefined) {
    if (env.cause === undefined) {
      env.waiting.push(() => start(inst, subscriptions, key, running))
    }
    return
  }
  if (!current()) return
  const tree = inst.tree
  const subscription = running.latest
  const source: MessageLog.Source = {
    _tag: "Subscription",
    key,
    name: running.name,
    deps: running.deps
  }
  const scope = Scope.makeUnsafe("sequential")
  const context = Context.add(ctx, Scope.Scope, scope)
  // Rendering the ancestors may stop this key, or change its declaration.
  const enter = (f: (latest: Subscription.Subscription<any, any>) => void) =>
    follow(tree)(() => {
      inst.tree.ops.renderAbove(inst)
      if (current()) f(running.latest)
    })
  const deliver = (message: unknown, accepted?: () => void) =>
    enter(() => {
      accepted?.()
      inst.tree.ops.send(inst, message, source)
    })
  const failed = (cause: Cause.Cause<unknown>) =>
    follow(tree)(() =>
      inst.tree.ops.fail(inst, "subscription", cause, undefined, undefined, key)
    )
  // Attached to its source, it dispatches synchronously, and only its first check waits.
  const attached = (subscription as services.Direct)[services.direct]?.(
    context,
    (message, accepted) => {
      if (current()) deliver(message, accepted)
    },
    (cause) => {
      if (current()) failed(cause)
    },
    enter
  )
  running.detach = attached?.close
  const fiber = fork(
    tree,
    context,
    Effect.onExit(
      attached !== undefined
        ? attached.initial
        : Stream.runForEach(
          subscription.stream,
          (message) => Effect.sync(() => deliver(message))
        ),
      (exit) => Scope.close(scope, exit)
    )
  )
  running.fiber = fiber
  // A Stream that ends stays stopped until its key leaves and comes back.
  fiber.addObserver((exit) => {
    if (
      Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause) && current()
    ) failed(exit.cause)
  })
}
