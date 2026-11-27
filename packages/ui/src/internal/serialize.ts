import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import { runCodec, warnOnce, warnUnencoded } from "./codecRun.ts"
import * as Kernel from "./kernel.ts"
import { segment, slotSegment } from "./paths.ts"
import * as queryCore from "./queryCore.ts"
import type * as services from "./services.ts"
import { encodePage, stateCodecOf } from "./stateCodec.ts"

interface Page {
  readonly state: unknown
  readonly reported: unknown
}

type Encoded = Exit.Exit<Page, SchemaIssue.Issue>

type Status = "Pending" | "Failed" | undefined

interface InstanceSnap {
  readonly inst: Kernel.Instance
  readonly encoded:
    | Encoded
    | Fiber.Fiber<Page, SchemaIssue.Issue>
    | undefined
  readonly status: Status
  readonly bare: boolean
}

interface FallbackSnap {
  readonly path: string
  readonly failedChild: boolean
  readonly status: Status
}

// Tape opcodes. Each is followed by one value.
const Text = 0
const Open = 1
const Close = 2
const Enter = 3
const Leave = 4
/** A `FallbackSnap`, closed by `FallbackEnd` with its path. */
const Fallback = 5
const FallbackEnd = 6
/** An `InstanceSnap`, then its content, `Kept`, its kept children, and `End`. */
const Instance = 7
/** The instance's path when it has kept children, each after an `Into` with its path. */
const Kept = 8
const Into = 9
const End = 10

const statusOf = (env: Kernel.Env): Status =>
  env.ctx !== undefined
    ? undefined
    : env.cause !== undefined
    ? "Failed"
    : "Pending"

interface Snapshot {
  readonly tape: ReadonlyArray<any>
  readonly late: ReadonlyArray<Fiber.Fiber<Page, SchemaIssue.Issue>>
}

/**
 * Records the tree as a tape. Neither this nor `write` recurses, so a tree the kernel could draw is
 * written however deep it nests.
 *
 * @internal
 */
export const snapshot = (
  root: Kernel.Instance,
  deferred: ReadonlySet<Kernel.Instance>,
  shippedQuery?: queryCore.ShippedContext | undefined
): Snapshot => {
  const tape: Array<unknown> = []
  const late: Array<Fiber.Fiber<Page, SchemaIssue.Issue>> = []
  /**
   * What is left to record, last first, in threes: a Rec after its owner and base, an instance, or
   * `undefined` after a tape entry to add as it is.
   */
  const todo: Array<any> = [undefined, undefined, root]
  const kidsOf = (
    owner: Kernel.Instance,
    kids: ReadonlyArray<Kernel.Rec> | undefined,
    base: string
  ): void => {
    if (kids === undefined) return
    for (let index = kids.length - 1; index >= 0; index--) {
      todo.push(owner, base, kids[index])
    }
  }
  const instance = (inst: Kernel.Instance): void => {
    const component = inst.component as unknown as Component.Any
    const rendered = inst.rendered
    const encoded = inst.failure === undefined && !deferred.has(inst)
      ? runCodec(
        Effect.provideService(
          encodePage(component, inst.model, inst.results, inst.owning),
          queryCore.Shipped,
          shippedQuery
        )
      )
      : undefined
    if (encoded !== undefined && !Exit.isExit(encoded)) late.push(encoded)
    tape.push(
      Instance,
      {
        inst,
        encoded,
        status: component.layer === undefined ? undefined : statusOf(inst.env),
        bare: inst.parent !== undefined && component.layer === undefined &&
          (inst.at!.v as View.Child<any, any>).alive === undefined &&
          rendered?.v._tag === "Element"
      } satisfies InstanceSnap
    )
    todo.push(End, undefined, undefined)
    let kept: string | undefined
    const entries = inst.kept?.children()
    if (entries !== undefined) {
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index]!
        if (entry.rec === undefined && !entry.inst.closed) {
          kept = inst.path
          todo.push(
            undefined,
            undefined,
            entry.inst,
            Into,
            entry.inst.path,
            undefined
          )
        }
      }
    }
    todo.push(Kept, kept, undefined)
    if (inst.failure === undefined && rendered !== undefined) {
      todo.push(inst, inst.path, rendered)
    }
  }
  while (todo.length > 0) {
    const at: Kernel.Rec | Kernel.Instance | undefined = todo.pop()
    const base = todo.pop()
    const owner = todo.pop()
    if (at === undefined) {
      tape.push(owner, base)
      continue
    }
    if (at instanceof Kernel.Instance) {
      instance(at)
      continue
    }
    const view = at.v
    switch (view._tag) {
      case "Text":
        tape.push(Text, view.text)
        break
      case "Element":
        tape.push(Open, view)
        todo.push(Close, view.tag, undefined)
        kidsOf(owner, at.kids, base)
        break
      case "Outlet": {
        const path = at.inst.path + "/" + slotSegment(view.name)
        tape.push(Enter, path)
        todo.push(Leave, path, undefined)
        kidsOf(at.inst.parent!, at.kids, path)
        break
      }
      case "Child": {
        if (at.kids === undefined) {
          instance(at.inst)
          break
        }
        // The author also holds fallbacks drawn in a headless child's closure.
        const failedChild = at.inst !== Kernel.authorOf(owner)
        const path = failedChild
          ? at.inst.path
          : base + "/" + segment(view as View.Child<any, any>)
        tape.push(
          Fallback,
          {
            path,
            failedChild,
            status: failedChild ? undefined : statusOf(owner.env)
          } satisfies FallbackSnap
        )
        todo.push(FallbackEnd, path, undefined)
        kidsOf(owner, at.kids, base)
      }
    }
  }
  return { tape, late }
}

const awaitEncoded = (
  late: ReadonlyArray<Fiber.Fiber<Page, SchemaIssue.Issue>>
): Effect.Effect<void> =>
  late.length === 0 ? Effect.void : Effect.onInterrupt(
    Effect.forEach(late, Fiber.await, { discard: true }),
    () => Fiber.interruptAll(late)
  )

const encodedOf = (snap: InstanceSnap): Encoded | undefined => {
  const encoded = snap.encoded
  if (encoded === undefined || Exit.isExit(encoded)) return encoded
  return encoded.pollUnsafe() as Encoded | undefined
}

const warnRedacted = (inst: Kernel.Instance, ctx: Context.Context<any>) =>
  warnOnce(
    "redacted",
    inst,
    ctx,
    () =>
      "its state holds a Schema.Redacted, so the server sends no state for it and the client builds it and " +
      "everything under it fresh, without hydration. Keep the secret in a leaf component or in a service."
  )

const ignore = () => {}
const mute: services.ServerSink = {
  text: ignore,
  open: ignore,
  close: ignore,
  enter: ignore,
  leave: ignore
}

/** @internal */
export const write = (
  { late, tape }: Snapshot,
  query: unknown,
  ctx: Context.Context<any>,
  isStatic: boolean,
  to: services.ServerSink
): Effect.Effect<Renderer.State> =>
  Effect.map(awaitEncoded(late), () => {
    const state: Record<string, unknown> = {}
    const kept: Record<string, unknown> = {}
    let into = state
    let sink = to
    /** Whether an instance above ships no state, so nothing below it does. */
    let under = false
    /** The kept children of the innermost instance that has some, by path. */
    let byChild: Record<string, unknown> | undefined
    /** What each open `Fallback` and `Instance` restores at its end. */
    const outer: Array<any> = []
    const deferredPaths: Array<string> = []
    const statuses: Record<string, string> = {}
    const collected: Record<string, unknown> = {}
    const ship = (path: string, status: Status) => {
      if (status !== undefined) statuses[path] = status
    }
    for (let at = 0; at < tape.length;) {
      const op = tape[at++]
      const value = tape[at++]
      switch (op) {
        case Text:
          sink.text(value)
          break
        case Open:
          sink.open(value.tag, value.attrs, value.props)
          break
        case Close:
          sink.close(value)
          break
        case Enter:
          sink.enter(value)
          break
        case Leave:
          sink.leave(value)
          break
        case Fallback: {
          const snap: FallbackSnap = value
          if (!under) {
            if (snap.failedChild) deferredPaths.push(snap.path)
            else ship(snap.path, snap.status)
          }
          sink.enter(snap.path)
          outer.push(under)
          under = true
          break
        }
        case FallbackEnd:
          sink.leave(value)
          under = outer.pop()
          break
        case Instance: {
          const snap: InstanceSnap = value
          const inst = snap.inst
          const path = inst.path
          outer.push(under)
          if (!under) {
            const exit = encodedOf(snap)
            if (exit === undefined || Exit.isFailure(exit)) {
              if (
                stateCodecOf(inst.component as unknown as Component.Any)
                  .redacted
              ) warnRedacted(inst, ctx)
              else if (exit !== undefined) {
                warnUnencoded(inst, ctx, exit.cause)
              }
              if (into === state) deferredPaths.push(path)
              under = true
            } else {
              into[path] = exit.value.state
              if (exit.value.reported !== undefined) {
                collected[path] = exit.value.reported
              }
              ship(path, snap.status)
            }
          }
          const bare = !under && snap.bare
          if (!bare) sink.enter(path)
          outer.push(bare ? undefined : path)
          break
        }
        case Kept: {
          const path = outer.pop()
          if (path !== undefined) sink.leave(path)
          outer.push(into, byChild)
          if (value !== undefined) {
            ;(into === state
              ? kept
              : (into["~kept"] ??= {}) as Record<string, unknown>)[value] =
              byChild =
                {}
            sink = mute
          }
          break
        }
        case Into:
          into = byChild![value] = {}
          break
        case End:
          byChild = outer.pop()
          into = outer.pop()
          under = outer.pop()
          if (into === state) sink = to
      }
    }
    const add = (key: string, value: unknown) =>
      Object.defineProperty(state, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
      })
    add("~deferred", deferredPaths)
    if (Object.keys(statuses).length > 0) add("~status", statuses)
    add("~query", query)
    if (Object.keys(collected).length > 0) add("~reported", collected)
    if (Object.keys(kept).length > 0) add("~kept", kept)
    if (isStatic) add("~static", true)
    return state
  })

/** @internal */
export const nodeSink = (
  nodes: Array<Renderer.ServerNode>
): services.ServerSink => {
  let children = nodes
  const parents: Array<Array<Renderer.ServerNode>> = []
  const into = (next: Array<Renderer.ServerNode>) => {
    parents.push(children)
    children = next
  }
  const out = () => {
    children = parents.pop()!
  }
  return {
    text: (text) => children.push({ _tag: "Text", text }),
    open(tag, attrs, props) {
      const inner: Array<Renderer.ServerNode> = []
      children.push({ _tag: "Element", tag, attrs, props, children: inner })
      into(inner)
    },
    close: out,
    enter(path) {
      const inner: Array<Renderer.ServerNode> = []
      children.push({ _tag: "Range", path, children: inner })
      into(inner)
    },
    leave: out
  }
}
