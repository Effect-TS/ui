import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as MessageLog from "../MessageLog.ts"
import type * as Subscription from "../Subscription.ts"
import { going, hold } from "./closing.ts"
import { follow, fork, servicesOf } from "./fork.ts"
import type * as Kernel from "./kernel.ts"
import * as services from "./services.ts"
import { duplicateKey } from "./subscriptions.ts"

interface Running {
  readonly name: string
  readonly deps: ReadonlyArray<Subscription.Dep> | undefined
  latest: Subscription.Subscription<any, any>
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  detach: (() => void) | undefined
}

const runningOf = new WeakMap<Kernel.Instance, Map<string, Running>>()

const stop = (running: Running): void => {
  running.detach?.()
  running.fiber?.interruptUnsafe(Fiber.getCurrent()?.id)
}

/** @internal */
export const sync = (inst: Kernel.Instance): void => {
  if (inst.closed || inst.tree.host.inert) return
  const server = inst.tree.host.server
  if (
    server !== undefined &&
    (inst.parent !== undefined || checked.has(inst.tree))
  ) return
  let wanted: ReadonlyArray<Subscription.Subscription<any, any>>
  try {
    wanted = (inst.component as unknown as {
      readonly subscriptions: (
        model: unknown,
        props: unknown,
        results: unknown
      ) => ReadonlyArray<Subscription.Subscription<any, any>>
    }).subscriptions(inst.model, inst.props, inst.results)
  } catch (error) {
    if (server !== undefined) throw error
    return inst.tree.ops.fail(inst, "subscription", Cause.die(error))
  }
  const byKey = new Map<string, Subscription.Subscription<any, any>>()
  let declaration: services.Prefetch | undefined
  for (const subscription of wanted) {
    const declared =
      (subscription as { readonly [services.prefetch]?: services.Prefetch })[
        services.prefetch
      ]
    if (declared !== undefined) {
      if (declaration !== undefined) {
        return inst.tree.ops.fail(
          inst,
          "subscription",
          Cause.die(
            new Error(
              `${inst.path}: subscriptions returned Router.prefetch twice. An instance declares its routes' reads in one map.`
            )
          ),
          undefined,
          undefined,
          "@effect/ui/Router/prefetch"
        )
      }
      declaration = declared
      continue
    }
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
  if (server !== undefined) return checkOnServer(inst, server, byKey)
  const ctx = servicesOf(inst.env)
  if (ctx !== undefined) {
    Context.get(ctx, services.CurrentRoot)()?.declare?.(
      inst as never,
      declaration
    )
  }
  let subscriptions = runningOf.get(inst)
  if (subscriptions === undefined) {
    if (byKey.size === 0) return
    const made = subscriptions = new Map()
    runningOf.set(inst, made)
    ;(inst.closers ??= []).push(() => {
      const waits: Array<Fiber.Fiber<unknown, unknown>> = []
      stopAll(made, waits)
      hold(inst, waits)
    })
    ;(inst.swaps ??= []).push((waits) => {
      for (const [key, running] of made) {
        inst.tree.log?.(inst, {
          _tag: "SubscriptionStopped",
          key,
          name: running.name,
          deps: running.deps
        })
      }
      stopAll(made, waits)
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
    if (running.fiber !== undefined && going(running.fiber)) {
      hold(inst, [running.fiber])
    }
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

const checked = new WeakSet<Kernel.Tree>()

const checkOnServer = (
  inst: Kernel.Instance,
  server: Kernel.Server,
  byKey: Map<string, Subscription.Subscription<any, any>>
): void => {
  checked.add(inst.tree)
  for (const subscription of byKey.values()) {
    const hook = (subscription as services.OnServer)[services.onServer]
    if (hook === undefined) continue
    const env = inst.env
    const run = () => env.ctx !== undefined && hook(env.ctx, server.report)
    if (env.cause === undefined && env.ctx === undefined) env.waiting.push(run)
    else run()
  }
}

const stopAll = (
  made: Map<string, Running>,
  waits: Array<Fiber.Fiber<unknown, unknown>>
): void => {
  for (const running of made.values()) {
    stop(running)
    if (running.fiber !== undefined && going(running.fiber)) {
      waits.push(running.fiber)
    }
  }
  made.clear()
}

const start = (
  inst: Kernel.Instance,
  subscriptions: Map<string, Running>,
  key: string,
  running: Running
): void => {
  const current = () => !inst.closed && subscriptions.get(key) === running
  const again = () => start(inst, subscriptions, key, running)
  if (!current() || inst.hold?.(again)) return
  const env = inst.env
  let ctx = env.ctx
  if (ctx === undefined) {
    if (env.cause === undefined) {
      env.waiting.push(() => env.ctx !== undefined && again())
      return
    }
    ctx = inst.hold === undefined ? servicesOf(env) : undefined
    if (ctx === undefined) return
  }
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
  fiber.addObserver((exit) => {
    if (
      Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause) && current()
    ) failed(exit.cause)
  })
}
