import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Tracer from "effect/Tracer"
import type * as Command from "../Command.ts"
import type * as MessageLog from "../MessageLog.ts"
import type * as Query from "../Query.ts"
import { going, heldBy, hold } from "./closing.ts"
import { defer, routed } from "./due.ts"
import { follow, fork, now, servicesOf } from "./fork.ts"
import * as Kernel from "./kernel.ts"
import { isNoop } from "./noop.ts"
import * as queryCore from "./queryCore.ts"
import { refsOf } from "./refs.ts"
import * as schedule from "./schedule.ts"
import { isNavigation, isOnCommit, Refs } from "./services.ts"

type Issued =
  | Command.Issued<any, any, never, "Effect">
  | Command.Issued<any, any, never, "Stream">

interface Run {
  readonly command: Issued
  readonly issued: Kernel.Issued
  readonly message: string | undefined
  status: schedule.Status
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  done: boolean
  held:
    | { readonly message: unknown; readonly source: MessageLog.Source }
    | undefined
  silent: boolean | undefined
  span: Command.SpanContext | undefined
  cut: (<A>(f: () => A) => A) | undefined
  reason: MessageLog.InterruptReason | undefined
  gated: boolean
  handle: Query.RunHandle | undefined
  waiting: boolean
  waited:
    | {
      readonly waitEnded: MessageLog.WaitEnded
      readonly outstanding: ReadonlyArray<Query.AwaitedEntry>
    }
    | undefined
  cancelWait: (() => void) | undefined
}

type CleanupFailed = (
  path: string,
  command: string,
  cause: Cause.Cause<unknown>
) => unknown

class Runs implements Kernel.Runs {
  readonly inst: Kernel.Instance
  readonly cleanupFailed: CleanupFailed
  readonly list: Array<Run> = []
  left: (<A>(f: () => A) => A) | undefined
  constructor(inst: Kernel.Instance, cleanupFailed: CleanupFailed) {
    this.inst = inst
    this.cleanupFailed = cleanupFailed
    ;(inst.closers ??= []).push(() => this.close())
    ;(inst.swaps ??= []).push((waits) => this.swap(waits))
  }
  close(): void {
    const inst = this.inst
    queryCore.loaded?.run.closing(inst)
    this.left = follow(inst.tree)
    const waits = heldBy(inst)
    const stopAll = () => {
      for (const run of this.list.slice()) this.stop(run, "unmount")
    }
    if (waits.length === 0) stopAll()
    else {
      let left = waits.length
      for (const fiber of waits) {
        fiber.addObserver(() => --left === 0 && follow(inst.tree)(stopAll))
      }
    }
    for (const run of this.list) {
      if (run.fiber !== undefined && going(run.fiber)) waits.push(run.fiber)
    }
    hold(inst, waits)
  }
  swap(waits: Array<Fiber.Fiber<unknown, unknown>>): void {
    const stopped = this.list.filter((run) => !run.gated)
    for (const run of stopped) if (run.status !== "running") this.drop(run)
    for (const run of stopped) if (!run.done) this.drop(run)
    for (const run of this.list) {
      if (run.status === "stopping") waits.push(run.fiber!)
    }
  }
  drop(run: Run): void {
    if (run.held === undefined) return this.stop(run, "layer")
    run.held = undefined
    this.remove(run)
    ended(this.inst, run)
    redraw(this.inst)
  }
  running = (name: string, groupKey: string | undefined): boolean =>
    this.list.some((run) =>
      run.command.name === name &&
      (groupKey === undefined || run.command.groupKey === groupKey)
    )
  pending() {
    return this.list.map((run) => ({
      name: run.command.name,
      status: run.status
    }))
  }
  remove(run: Run): void {
    run.done = true
    early.get(this.inst.tree)?.delete(run)
    const index = this.list.indexOf(run)
    if (index >= 0) this.list.splice(index, 1)
  }
  promote(run: Run): void {
    for (;;) {
      const next = schedule.next(entriesOf(this), entryOf(run))
      if (next === undefined) return
      if (this.inst.closed) {
        this.stop(next.value, "unmount")
        continue
      }
      next.value.status = "running"
      this.start(next.value)
      return
    }
  }
  stop(run: Run, reason: MessageLog.InterruptReason): void {
    if (run.done) return
    const inst = this.inst
    if (run.held !== undefined) {
      const closed = inst.closed || inst.tree.closed
      endWait(
        run,
        closed ? "closed" : reason === "switch" ? reason : "interrupt"
      )
      if (closed) {
        run.held = undefined
        this.remove(run)
        ended(inst, run)
      } else this.deliver(run)
      return
    }
    const fiber = run.fiber
    if (fiber !== undefined && fiber.pollUnsafe() === undefined) {
      run.done = true
      run.status = "stopping"
      run.cut = follow(inst.tree)
      run.reason = reason
      fiber.interruptUnsafe()
      return
    }
    this.remove(run)
    if (fiber === undefined) run.handle?.finish({ _tag: "Stopped" })
    interrupted(inst, run, reason)
    redraw(inst)
    this.promote(run)
  }
  start(run: Run): void {
    const inst = this.inst
    if (run.done) return
    if (
      inst.hold?.(() => {
        run.gated = false
        this.start(run)
      })
    ) {
      run.gated = true
      return
    }
    const env = inst.env
    let ctx = env.ctx
    if (ctx === undefined) {
      if (env.cause === undefined) {
        env.waiting.push(() =>
          env.cause === undefined ? this.start(run) : this.stop(run, "layer")
        )
        return
      }
      ctx = servicesOf(env)
    }
    const command = run.command
    const tree = inst.tree
    const scope = Scope.makeUnsafe("sequential")
    let source: MessageLog.Source = {
      _tag: "Command",
      name: command.name,
      issued: run.issued,
      spanId: undefined,
      traceId: undefined
    }
    const send = (message: unknown) => {
      if (run.done) return
      const silent = isNoop(message)
      run.silent = silent && run.silent !== false
      if (!silent) follow(tree)(() => Kernel.send(inst, message, source))
    }
    const attributes = run.message === undefined
      ? { path: inst.path, mode: command.mode }
      : { path: inst.path, mode: command.mode, message: run.message }
    const parentSpan = command.parentSpan
    const program = Effect.useSpan(
      command.name,
      // Without a parent the run starts its own trace: the runtime's span is the mount's, stale for a click.
      {
        attributes,
        parent: parentSpan && Tracer.externalSpan(parentSpan),
        root: true
      },
      (span): Effect.Effect<unknown, unknown, any> => {
        if (run.done || inst.closed) return Effect.interrupt
        const spanContext = queryCore.spanContextOf(span)
        run.span = spanContext
        const log = tree.log
        if (log !== undefined) {
          begun(() =>
            log(inst, {
              _tag: "CommandStarted",
              name: command.name,
              issued: run.issued,
              spanId: span.spanId,
              traceId: span.traceId,
              ...(Option.isSome(span.parent)
                ? { parentSpanId: span.parent.value.spanId }
                : undefined)
            })
          )
        }
        source = {
          _tag: "Command",
          name: command.name,
          issued: run.issued,
          spanId: span.spanId,
          traceId: span.traceId
        }
        const body: Effect.Effect<unknown, unknown, any> =
          command._tag === "Effect"
            ? command.work
            : Stream.runForEach(
              command.work,
              (element) =>
                Effect.sync(() =>
                  send(command.resolve(element as never, spanContext))
                )
            )
        const work = Effect.provideService(body, Tracer.ParentSpan, span)
        const writes = command.writes as
          | ((success: unknown) => ReadonlyArray<Query.Write>)
          | undefined
        if (run.handle !== undefined) {
          return run.handle.run(work, writes, spanContext)
        }
        if (writes === undefined) return work
        return Effect.uninterruptibleMask((restore) =>
          Effect.flatMap(Effect.exit(restore(work)), (exit) => {
            let sets: ReadonlyArray<Query.Write> | undefined
            if (run.handle === undefined && exit._tag === "Success") {
              try {
                sets = writes(exit.value)
              } catch (error) {
                early.get(tree)?.delete(run)
                return Effect.die(error)
              }
              if (sets.length > 0) {
                queryCore.loaded!.run.cacheOf(inst)
                beginEarly(tree)
              }
            }
            const handle = run.handle
            const made = sets
            if (handle !== undefined) {
              return handle.run(
                exit,
                made === undefined ? writes : () => made,
                spanContext
              )
            }
            early.get(tree)?.delete(run)
            return exit
          })
        )
      }
    )
    let begun = now
    const go = (now?: boolean) => {
      if (run.done || inst.closed) return
      begun = follow(tree, true)
      const context = Context.add(
        Context.add(ctx, Scope.Scope, scope),
        Refs,
        refsOf(inst)
      )
      const fiber = fork(
        tree,
        now
          ? Context.add(context, Scheduler.PreventSchedulerYield, true)
          : context,
        Effect.onExit(program, (exit) => Scope.close(scope, exit)),
        now
      )
      run.fiber = fiber
      fiber.addObserver((exit) => {
        follow(tree)(() => this.exited(run, exit, source))
      })
    }
    if (routed.has(tree) && isNavigation(command)) defer(tree, () => go(true))
    else if (isOnCommit(command)) {
      ;(tree.committed ??= []).push(() => go(true))
      Kernel.wake(tree)
    } else go()
  }
  exited(
    run: Run,
    exit: Exit.Exit<unknown, unknown>,
    source: MessageLog.Source
  ): void {
    const inst = this.inst
    const command = run.command
    run.handle?.finish({ _tag: "Stopped" })
    if (run.status === "stopping") {
      this.remove(run)
      run.cut!(() => interrupted(inst, run, run.reason!))
      if (Exit.isFailure(exit) && Cause.hasDies(exit.cause)) {
        queryCore.report(
          inst.env.ctx ?? Context.empty(),
          this.cleanupFailed(inst.path, command.name, exit.cause)
        )
      }
      redraw(inst)
      this.promote(run)
      return
    }
    if (run.done) return
    const stopped = Exit.isFailure(exit) && !Cause.hasDies(exit.cause) &&
      !Cause.hasFails(exit.cause)
    const waits = command._tag === "Effect" &&
      command.afterRefetch !== undefined && Exit.isSuccess(exit)
    if (inst.closed || stopped) {
      this.remove(run)
      if (stopped) {
        if (!inst.closed || run.span !== undefined) {
          interrupted(inst, run, "self")
        } else (this.left ?? now)(() => interrupted(inst, run, "unmount"))
      } else {
        if (Exit.isFailure(exit)) {
          fork(
            inst.tree,
            inst.env.ctx!,
            Effect.logError(
              `${inst.path} is gone, and its Command ${command.name} failed`,
              exit.cause
            )
          )
        }
        if (waits) {
          run.waited = {
            waitEnded: "closed",
            outstanding: run.handle?.outstanding() ?? []
          }
        }
        ended(inst, run)
      }
      redraw(inst)
      this.promote(run)
      return
    }
    const reject = command.reject
    if (
      Exit.isFailure(exit) &&
      (Cause.hasDies(exit.cause) || reject === undefined)
    ) {
      this.remove(run)
      Kernel.fail(
        inst,
        "command",
        exit.cause,
        undefined,
        undefined,
        command.name,
        run.issued
      )
      return
    }
    if (Exit.isSuccess(exit) && command._tag === "Stream") {
      this.remove(run)
      ended(inst, run)
      redraw(inst)
      this.promote(run)
      return
    }
    let message: unknown
    try {
      const span = run.span!
      message = Exit.isFailure(exit)
        ? reject!(
          Option.getOrUndefined(Cause.findErrorOption(exit.cause)) as never,
          span
        )
        : command.resolve(exit.value as never, span)
    } catch (error) {
      this.remove(run)
      Kernel.fail(
        inst,
        "command",
        Cause.die(error),
        undefined,
        undefined,
        command.name,
        run.issued
      )
      return
    }
    run.silent = isNoop(message) && run.silent !== false
    run.status = "awaiting"
    run.held = { message, source }
    this.promote(run)
    if (waits) this.wait(run)
    this.release(run)
  }
  wait(run: Run): void {
    const inst = this.inst
    const handle = run.handle
    const awaited = handle?.awaited() ?? []
    if (handle === undefined || awaited.length === 0) {
      run.waited = { waitEnded: "nothing", outstanding: [] }
      return
    }
    inst.tree.log?.(inst, {
      _tag: "CommandAwaiting",
      name: run.command.name,
      issued: run.issued,
      entries: awaited
    })
    run.waiting = true
    if (handle.outstanding().length === 0) return endWait(run, "settled")
    const budget = run.command.afterRefetch!
    const remaining = Duration.isFinite(budget)
      ? Math.max(0, Duration.toMillis(budget) - handle.sinceApplied())
      : Infinity
    if (remaining === 0) return endWait(run, "budget")
    const resume = follow(inst.tree)
    const end = (by: MessageLog.WaitEnded) =>
      resume(() => {
        endWait(run, by)
        defer(inst.tree, () => this.release(run))
      })
    const off = handle.onRefetched(() => end("settled"))
    const timer = Number.isFinite(remaining)
      ? fork(
        inst.tree,
        inst.env.ctx ?? (Context.empty() as Context.Context<any>),
        Effect.andThen(
          Effect.sleep(Duration.millis(remaining)),
          Effect.sync(() => end("budget"))
        )
      )
      : undefined
    run.cancelWait = () => {
      off()
      timer?.interruptUnsafe()
    }
  }
  release(run: Run): void {
    for (;;) {
      if (run.command.mode !== "queue" && run.done) return
      const next = schedule.deliverable(
        entriesOf(this),
        entryOf(run),
        (other) => !other.waiting
      )
      if (next === undefined) return
      if (this.inst.closed || this.inst.tree.closed) {
        return this.stop(next.value, "unmount")
      }
      this.deliver(next.value)
    }
  }
  deliver(run: Run): void {
    const inst = this.inst
    const held = run.held!
    run.held = undefined
    if (!isNoop(held.message)) {
      Kernel.send(inst, held.message, held.source)
    }
    if (run.done) return
    this.remove(run)
    ended(inst, run)
    redraw(inst)
  }
}

const endWait = (run: Run, by: MessageLog.WaitEnded): void => {
  if (!run.waiting) return
  run.waiting = false
  run.waited = {
    waitEnded: by,
    outstanding: by === "settled" ? [] : run.handle!.outstanding()
  }
  const cancel = run.cancelWait
  run.cancelWait = undefined
  cancel?.()
}

const redraw = (inst: Kernel.Instance): void => {
  if (!inst.closed) Kernel.markDirty(inst)
}

const entryOf = (run: Run): schedule.Entry<Run> => ({
  name: run.command.name,
  key: run.command.groupKey,
  mode: run.command.mode,
  status: run.status,
  value: run
})

const entriesOf = (runs: Runs) => runs.list.map(entryOf)

const early = new WeakMap<Kernel.Tree, Map<Run, Kernel.Instance>>()

const begin = (inst: Kernel.Instance, command: Issued): Query.RunHandle =>
  queryCore.loaded!.run.cacheOf(inst).beginRun({
    command: command.name,
    invalidates: command.invalidates as ReadonlyArray<Query.Target>,
    optimistic: command.optimistic as ReadonlyArray<Query.Patch>,
    afterRefetch: command._tag === "Effect" &&
      command.afterRefetch !== undefined
  })

const beginEarly = (tree: Kernel.Tree): void => {
  const runs = early.get(tree)
  if (runs === undefined) return
  early.delete(tree)
  tree.cached = undefined
  for (const [run, at] of runs) {
    run.handle = begin(at, run.command)
    if (run.span !== undefined) run.handle.start(run.span)
  }
}

export const issue = (
  inst: Kernel.Instance,
  command: Command.Command<any, any>,
  issued: Kernel.Issued,
  message: string | undefined,
  cleanupFailed: CleanupFailed
): void => {
  if (inst.closed) return
  const server = inst.tree.host.server
  if (server !== undefined) return server.drop(inst, command.name, issued)
  const runs = (inst.runs ??= new Runs(inst, cleanupFailed)) as Runs
  const decision = schedule.schedule(entriesOf(runs), command)
  if (command._tag === "Interrupt") {
    for (const entry of decision.interrupt) runs.stop(entry.value, "interrupt")
    return
  }
  let handle: Query.RunHandle | undefined
  if (command.service !== undefined && queryCore.loaded !== undefined) {
    try {
      queryCore.loaded.run.cacheOf(inst)
      beginEarly(inst.tree)
      handle = begin(inst, command)
    } catch (error) {
      const where = inst.rendered === undefined && inst.failure === undefined
        ? "init"
        : "update"
      return Kernel.fail(
        inst,
        where,
        Cause.die(error),
        undefined,
        undefined,
        command.name
      )
    }
  }
  for (const entry of decision.interrupt) runs.stop(entry.value, "switch")
  const run: Run = {
    command,
    issued,
    message,
    status: decision.action === "start" ? "running" : "queued",
    fiber: undefined,
    done: false,
    held: undefined,
    silent: undefined,
    span: undefined,
    cut: undefined,
    reason: undefined,
    gated: false,
    handle,
    waiting: false,
    waited: undefined,
    cancelWait: undefined
  }
  runs.list.push(run)
  if (
    handle === undefined && command.service !== undefined &&
    command.writes !== undefined
  ) {
    let waiting = early.get(inst.tree)
    if (waiting === undefined) {
      const tree = inst.tree
      early.set(tree, waiting = new Map())
      tree.cached = () => beginEarly(tree)
    }
    waiting.set(run, inst)
  }
  if (run.status === "running") runs.start(run)
  else runs.promote(run)
  redraw(inst)
}

const ended = (inst: Kernel.Instance, run: Run): void => {
  inst.tree.log?.(inst, {
    _tag: "CommandEnded",
    name: run.command.name,
    issued: run.issued,
    spanId: run.span?.spanId,
    traceId: run.span?.traceId,
    silent: run.silent === true,
    ...run.waited
  })
}

const interrupted = (
  inst: Kernel.Instance,
  run: Run,
  reason: MessageLog.InterruptReason
): void => {
  inst.tree.log?.(inst, {
    _tag: "CommandInterrupted",
    name: run.command.name,
    issued: run.issued,
    spanId: run.span?.spanId,
    traceId: run.span?.traceId,
    reason
  })
}
