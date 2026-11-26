import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as Mount from "../Mount.ts"
import { follow, fork, inlined, servicesOf } from "./fork.ts"
import * as Kernel from "./kernel.ts"
import type * as mountArgs from "./mountArgs.ts"
import { isNoop } from "./noop.ts"
import { afterCommit, refsOf } from "./refs.ts"
import { Refs } from "./services.ts"

class Running {
  readonly rec: Kernel.Rec
  mount: Mount.Any
  args: mountArgs.MountArgs | undefined = undefined
  fiber: Fiber.Fiber<unknown, unknown> | undefined = undefined
  cut: (<A>(f: () => A) => A) | undefined = undefined
  ctx: Context.Context<any> | undefined = undefined
  readonly scope = Scope.makeUnsafe("sequential")
  constructor(rec: Kernel.Rec, mount: Mount.Any) {
    this.rec = rec
    this.mount = mount
  }
  start(from: <A>(f: () => A) => A): void {
    const inst = this.rec.inst
    const env = inst.env
    let ctx = env.ctx
    if (ctx === undefined) {
      // A `beforeCommit` mount needs no services, so it doesn't wait for a Layer above it.
      if (env.cause === undefined && this.mount.beforeCommit !== true) {
        env.waiting.push(() => env.cause === undefined && this.start(from))
        return
      }
      ctx = servicesOf(env)
    }
    if (this.cut !== undefined || inst.closed) return
    const tree = inst.tree
    const { args, argsSchema, name } = this.mount
    const started = from(() =>
      tree.log?.(inst, { _tag: "MountStarted", name, args, argsSchema })
    )
    let silent: boolean | undefined
    const send = (result: unknown) =>
      Effect.sync(() => {
        const latest = this.mount
        const message = latest.resolve(result as never)
        const noop = isNoop(message)
        silent = noop && silent !== false
        if (noop || this.cut !== undefined) return
        const source = {
          _tag: "Mount",
          seq: started,
          name: latest.name,
          args: latest.args,
          argsSchema: latest.argsSchema
        }
        follow(tree)(() => Kernel.send(inst, message, source))
      })
    const changes = Stream.suspend(() => {
      const kept = this.mount["~args"]
      let made = this.args
      if (made === undefined) {
        const fresh = made = this.args = kept.make(this.mount.args)
        Effect.runSync(
          Scope.addFinalizer(this.scope, Effect.sync(() => kept.close(fresh)))
        )
      }
      return kept.changes(made)
    })
    const scope = this.scope
    this.ctx = ctx
    const fiber = this.fiber = fork(
      tree,
      Context.add(Context.add(ctx, Scope.Scope, scope), Refs, refsOf(inst)),
      Effect.suspend(() =>
        this.mount.run(this.rec.node as never, args, changes, send)
      ),
      true
    )
    Effect.runSync(Scope.addFinalizer(scope, Fiber.interrupt(fiber)))
    fiber.addObserver((exit) => {
      const failure =
        Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
          ? exit.cause
          : undefined
      const reason = failure !== undefined
        ? "failed"
        : this.cut === undefined && Exit.isSuccess(exit)
        ? "completed"
        : "closed"
      const run = reason === "closed" && this.cut !== undefined
        ? this.cut
        : follow(tree)
      run(() => {
        tree.log?.(inst, {
          _tag: "MountEnded",
          name,
          started,
          reason,
          silent: silent === true
        })
        if (failure !== undefined) {
          Kernel.fail(inst, "mount", failure, undefined, undefined, name)
        }
      })
    })
  }
  update(mount: Mount.Any): void {
    const previous = this.mount
    if (previous === mount) return
    this.mount = mount
    const args = this.args
    if (args !== undefined && !previous["~sameArgs"](mount)) {
      inlined(() => mount["~args"].publish(args, mount.args))
    }
  }
  stop(): void {
    if (this.cut !== undefined) return
    const tree = this.rec.inst.tree
    this.cut = follow(tree)
    const closer = tree.closed ? Fiber.getCurrent() : undefined
    if (closer !== undefined) this.fiber?.interruptUnsafe(closer.id)
    const close = Scope.close(this.scope, Exit.void)
    if (this.ctx === undefined) Effect.runSync(close)
    else fork(tree, this.ctx, close, true)
  }
}

const running = new WeakMap<Kernel.Rec, Running>()

/** @internal */
export const attach = (mount: Mount.Any, rec: Kernel.Rec): void => {
  const tree = rec.inst.tree
  if (tree.host.runsMounts !== true) {
    if (tree.host.inert === true) afterCommit(tree, () => still(mount, rec))
    return
  }
  const current = running.get(rec)
  if (current !== undefined && current.mount.name === mount.name) {
    return current.update(mount)
  }
  current?.stop()
  const next = new Running(rec, mount)
  running.set(rec, next)
  const from = follow(tree)
  const start = () => next.start(from)
  if (mount.beforeCommit === true && tree.scheduled) {
    ;(tree.committing ??= []).push(start)
  } else afterCommit(tree, start)
}

const still = (mount: Mount.Any, rec: Kernel.Rec): void => {
  const inst = rec.inst
  if (inst.closed) return
  if (mount.paint !== undefined) {
    try {
      return mount.paint(rec.node as never, mount.args)
    } catch {}
  }
  inst.tree.host.skipped?.(inst.path)
}

/** @internal */
export const detach = (rec: Kernel.Rec): void => {
  const current = running.get(rec)
  if (current === undefined) return
  running.delete(rec)
  current.stop()
}
