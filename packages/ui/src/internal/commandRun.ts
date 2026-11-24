/**
 * Runs the Commands an instance of the kernel issues. A Command carries it as its `~run`, so the kernel
 * never imports it, and an app that issues no Command doesn't carry it.
 *
 * Its rules are today's runtime's: `schedule` decides what a run does to its group, a stopped run holds
 * its group until its fiber exits, and a closed instance's runs are interrupted and logged as they end.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import type * as Command from "../Command.ts"
import type * as MessageLog from "../MessageLog.ts"
import { follow, fork } from "./fork.ts"
import type * as Kernel from "./kernel.ts"
import { isNoop } from "./noop.ts"
import { Problems } from "./queryCore.ts"
import * as schedule from "./schedule.ts"

type Issued =
  | Command.Issued<any, any, never, "Effect">
  | Command.Issued<any, any, never, "Stream">

interface Run {
  readonly command: Issued
  readonly issued: Kernel.Issued
  status: schedule.Status
  fiber: Fiber.Fiber<unknown, unknown> | undefined
  done: boolean
  /** From fiber exit until delivery: the result an awaiting run holds, and its source. */
  held:
    | { readonly message: unknown; readonly source: MessageLog.Source }
    | undefined
  /** Whether every result the run has had so far was `Component.noop`. `undefined` until the first. */
  silent: boolean | undefined
  spanId: string | undefined
  traceId: string | undefined
  /** What the `CommandInterrupted` of a run stopped with its fiber going follows from. */
  cut: (<A>(f: () => A) => A) | undefined
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
  constructor(inst: Kernel.Instance, cleanupFailed: CleanupFailed) {
    this.inst = inst
    this.cleanupFailed = cleanupFailed
    ;(inst.closers ??= []).push(() => this.close())
  }
  /**
   * Its descendants have closed, and it has logged `Unmounted`. Its runs stop once the runs its
   * descendants stopped have exited, as an instance's close waits for theirs, and its ancestors' closes
   * wait for its own.
   */
  close(): void {
    const inst = this.inst
    const waits = (holds.get(inst) ?? []).filter(going)
    const stopAll = () => {
      for (const run of this.list.slice()) this.stop(run)
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
    if (waits.length === 0) return
    for (let at = inst.parent; at !== undefined; at = at.parent) {
      holds.set(at, [...(holds.get(at) ?? []).filter(going), ...waits])
    }
  }
  running = (name: string, groupKey: string | undefined): boolean =>
    this.list.some((run) =>
      run.command.name === name &&
      (groupKey === undefined || run.command.groupKey === groupKey)
    )
  pending = () =>
    this.list.map((run) => ({ name: run.command.name, status: run.status }))
  remove(run: Run): void {
    run.done = true
    const index = this.list.indexOf(run)
    if (index >= 0) this.list.splice(index, 1)
  }
  /** Starts the next queued run of `run`'s group, once nothing in it runs. A closed instance starts nothing. */
  promote(run: Run): void {
    for (;;) {
      const next = schedule.next(entriesOf(this), entryOf(run))
      if (next === undefined) return
      if (this.inst.closed) {
        this.stop(next.value)
        continue
      }
      next.value.status = "running"
      this.start(next.value)
      return
    }
  }
  /**
   * Asks a run to stop: it delivers nothing from now on. A run whose fiber is going is interrupted, and
   * holds its group as `stopping` until the fiber exits. An awaiting run delivers at once, unless its
   * instance is gone.
   */
  stop(run: Run): void {
    if (run.done) return
    const inst = this.inst
    if (run.held !== undefined) {
      if (inst.closed || inst.tree.closed) {
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
      fiber.interruptUnsafe()
      return
    }
    this.remove(run)
    interrupted(inst, run)
    redraw(inst)
    this.promote(run)
  }
  start(run: Run): void {
    const inst = this.inst
    const env = inst.env
    const ctx = env.ctx
    // Its services are still building: it starts once they're there, and is stopped if they failed.
    if (ctx === undefined) {
      if (env.cause === undefined) env.waiting.push(() => this.start(run))
      else this.stop(run)
      return
    }
    if (run.done) return
    const command = run.command
    const tree = inst.tree
    // Every run gets a Scope of its own, closed with the run's exit, so what the body acquires is
    // released when the run ends.
    const scope = Scope.makeUnsafe("sequential")
    let source: MessageLog.Source = {
      _tag: "Command",
      name: command.name,
      issued: run.issued,
      spanId: undefined,
      traceId: undefined
    }
    // A Stream element: `Component.noop` sends nothing, and the Stream carries on.
    const send = (message: unknown) => {
      if (run.done) return
      const silent = isNoop(message)
      run.silent = silent && run.silent !== false
      if (!silent) follow(tree)(() => inst.tree.ops.send(inst, message, source))
    }
    const program = Effect.useSpan(
      command.name,
      { attributes: { path: inst.path, mode: command.mode } },
      (span): Effect.Effect<unknown, unknown, any> => {
        // Stopped before its first step, or its instance closed meanwhile: the work never begins.
        if (run.done || inst.closed) return Effect.interrupt
        run.spanId = span.spanId
        run.traceId = span.traceId
        source = {
          _tag: "Command",
          name: command.name,
          issued: run.issued,
          spanId: span.spanId,
          traceId: span.traceId
        }
        return command._tag === "Effect"
          ? command.work
          : Stream.runForEach(
            command.work,
            (element) =>
              Effect.sync(() => send(command.resolve(element as never)))
          )
      }
    )
    const fiber = fork(
      tree,
      Context.add(ctx, Scope.Scope, scope),
      Effect.onExit(program, (exit) => Scope.close(scope, exit))
    )
    run.fiber = fiber
    fiber.addObserver((exit) => {
      follow(tree)(() => this.exited(run, exit, source))
    })
  }
  /** A run's fiber exited: its result is sent, unless the run was stopped or its instance is gone. */
  exited(
    run: Run,
    exit: Exit.Exit<unknown, unknown>,
    source: MessageLog.Source
  ): void {
    const inst = this.inst
    const command = run.command
    if (run.status === "stopping") {
      // A stopped run sends nothing. A defect in its cleanup can't fail the run that replaced it: it's
      // reported.
      this.remove(run)
      run.cut!(() => interrupted(inst, run))
      if (Exit.isFailure(exit) && Cause.hasDies(exit.cause)) {
        const report = Context.get(inst.env.ctx ?? Context.empty(), Problems)
        try {
          report(
            this.cleanupFailed(inst.path, command.name, exit.cause) as never
          )
        } catch {
          // A sink can't change what the runtime does.
        }
      }
      redraw(inst)
      this.promote(run)
      return
    }
    if (run.done) return
    const stopped = Exit.isFailure(exit) && !Cause.hasDies(exit.cause) &&
      !Cause.hasFails(exit.cause)
    if (inst.closed || stopped) {
      // It ended while its instance closes, before the close stopped it: its message is dropped.
      this.remove(run)
      if (stopped) interrupted(inst, run)
      else {
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
      // A typed failure nothing maps is a defect too: an unmatched Command got past the types.
      this.remove(run)
      inst.tree.ops.fail(
        inst,
        "command",
        exit.cause,
        undefined,
        undefined,
        command.name
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
      message = Exit.isFailure(exit)
        ? reject!(
          Option.getOrUndefined(Cause.findErrorOption(exit.cause)) as never
        )
        : command.resolve(exit.value as never)
    } catch (error) {
      this.remove(run)
      inst.tree.ops.fail(
        inst,
        "command",
        Cause.die(error),
        undefined,
        undefined,
        command.name
      )
      return
    }
    run.silent = isNoop(message) && run.silent !== false
    // Awaiting until delivery: under `queue`, behind an earlier result of its group. The next queued run
    // starts first, so an `update` this delivers can't start another run of the group ahead of it.
    run.status = "awaiting"
    run.held = { message, source }
    this.promote(run)
    this.release(run)
  }
  /** Delivers the results of `run`'s group that can go now, in issue order under `queue`. */
  release(run: Run): void {
    for (;;) {
      if (run.command.mode !== "queue" && run.done) return
      const next = schedule.deliverable(
        entriesOf(this),
        entryOf(run),
        () => true
      )
      if (next === undefined) return
      if (this.inst.closed || this.inst.tree.closed) {
        return this.stop(next.value)
      }
      this.deliver(next.value)
    }
  }
  /** Sends an awaiting run's message, or nothing for `Component.noop`. The run is still listed while `update` handles it. */
  deliver(run: Run): void {
    const inst = this.inst
    const held = run.held!
    run.held = undefined
    if (!isNoop(held.message)) {
      inst.tree.ops.send(inst, held.message, held.source)
    }
    if (run.done) return
    this.remove(run)
    ended(inst, run)
    redraw(inst)
  }
}

/** The run fibers of closed descendants that each instance's own close waits for. */
const holds = new WeakMap<
  Kernel.Instance,
  ReadonlyArray<Fiber.Fiber<unknown, unknown>>
>()

/** Renders the instance again, for `h.isRunning`. */
const redraw = (inst: Kernel.Instance): void => {
  if (!inst.closed) inst.tree.ops.markDirty(inst)
}

const going = (fiber: Fiber.Fiber<unknown, unknown>): boolean =>
  fiber.pollUnsafe() === undefined

const entryOf = (run: Run): schedule.Entry<Run> => ({
  name: run.command.name,
  key: run.command.groupKey,
  mode: run.command.mode,
  status: run.status,
  value: run
})

const entriesOf = (runs: Runs) => runs.list.map(entryOf)

/**
 * Issues `command` from `inst`. `cleanupFailed` makes the problem a stopped run's defect is reported as.
 *
 * @internal
 */
export const issue = (
  inst: Kernel.Instance,
  command: Command.Command<any, any>,
  issued: Kernel.Issued,
  cleanupFailed: CleanupFailed
): void => {
  if (inst.closed) return
  const runs = (inst.runs ??= new Runs(inst, cleanupFailed)) as Runs
  const decision = schedule.schedule(entriesOf(runs), command)
  if (command._tag === "Interrupt") {
    for (const entry of decision.interrupt) runs.stop(entry.value)
    return
  }
  for (const entry of decision.interrupt) runs.stop(entry.value)
  const run: Run = {
    command,
    issued,
    status: decision.action === "start" ? "running" : "queued",
    fiber: undefined,
    done: false,
    held: undefined,
    silent: undefined,
    spanId: undefined,
    traceId: undefined,
    cut: undefined
  }
  runs.list.push(run)
  if (run.status === "running") runs.start(run)
  // Queued behind the runs `switch` cut, it starts now if none of them had a fiber to wait for.
  else runs.promote(run)
  redraw(inst)
}

const ended = (inst: Kernel.Instance, run: Run): void => {
  inst.tree.log?.(inst, {
    _tag: "CommandEnded",
    name: run.command.name,
    issued: run.issued,
    spanId: run.spanId,
    traceId: run.traceId,
    silent: run.silent === true
  })
}

const interrupted = (inst: Kernel.Instance, run: Run): void => {
  inst.tree.log?.(inst, {
    _tag: "CommandInterrupted",
    name: run.command.name,
    issued: run.issued,
    spanId: run.spanId,
    traceId: run.traceId
  })
}
