/** @internal */
import * as Cause from "effect/Cause"
import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../../Component.ts"
import type * as Renderer from "../../Renderer.ts"
import type * as View from "../../View.ts"
import type * as Kernel from "../kernel.ts"
import { segment, slotSegment } from "../paths.ts"
import type * as services from "../services.ts"
import { redactedIssue, stateCodecOf } from "../stateCodec.ts"

type Encoded = Exit.Exit<unknown, SchemaIssue.Issue>

type Status = "Pending" | "Failed" | undefined

type Snap =
  | { readonly _tag: "Text"; readonly text: string }
  | {
    readonly _tag: "Element"
    readonly view: View.Element<any, any>
    readonly kids: ReadonlyArray<Snap>
  }
  | {
    readonly _tag: "Instance"
    readonly inst: Kernel.Instance
    readonly encoded:
      | Encoded
      | Fiber.Fiber<unknown, SchemaIssue.Issue>
      | undefined
    readonly status: Status
    readonly bare: boolean
    readonly kids: ReadonlyArray<Snap>
  }
  | {
    readonly _tag: "Range"
    readonly path: string
    readonly kids: ReadonlyArray<Snap>
  }
  | {
    readonly _tag: "Fallback"
    readonly path: string
    readonly failedChild: boolean
    readonly status: Status
    readonly kids: ReadonlyArray<Snap>
  }

const statusOf = (env: Kernel.Env): Status =>
  env.ctx !== undefined
    ? undefined
    : env.cause !== undefined
    ? "Failed"
    : "Pending"

const runCodec = <A, E>(
  effect: Effect.Effect<A, E>
): Exit.Exit<A, E> | Fiber.Fiber<A, E> => {
  const exit = Effect.runSyncExit(effect)
  if (Exit.isFailure(exit)) {
    const defect = Cause.findDefect(exit.cause)
    if (Result.isSuccess(defect) && Cause.isAsyncFiberError(defect.success)) {
      return defect.success.fiber as Fiber.Fiber<A, E>
    }
  }
  return exit
}

/** @internal */
export const snapshot = (
  root: Kernel.Instance,
  deferred: ReadonlySet<Kernel.Instance>
): Snap => {
  const instance = (inst: Kernel.Instance): Snap => {
    const component = inst.component as unknown as Component.Any
    const shipped = inst.failure === undefined && !deferred.has(inst)
    const rendered = inst.rendered
    return {
      _tag: "Instance",
      inst,
      encoded: shipped
        ? runCodec(
          stateCodecOf(component).encode(inst.model, inst.results as never)
        )
        : undefined,
      status: component.layer === undefined ? undefined : statusOf(inst.env),
      bare: inst.parent !== undefined && component.layer === undefined &&
        rendered?.v._tag === "Element",
      kids: inst.failure === undefined && rendered !== undefined
        ? [rec(inst, rendered, inst.path)]
        : []
    }
  }
  const rec = (owner: Kernel.Instance, at: Kernel.Rec, base: string): Snap => {
    const view = at.v
    switch (view._tag) {
      case "Text":
        return { _tag: "Text", text: view.text }
      case "Element":
        return {
          _tag: "Element",
          view,
          kids: at.kids === undefined
            ? []
            : at.kids.map((kid) => rec(owner, kid, base))
        }
      case "Outlet": {
        const path = at.inst.path + "/" + slotSegment(view.name)
        return {
          _tag: "Range",
          path,
          kids: at.kids!.map((kid) => rec(at.inst.parent!, kid, path))
        }
      }
      case "Child": {
        if (at.kids === undefined) return instance(at.inst)
        const failedChild = at.inst !== owner
        return {
          _tag: "Fallback",
          path: failedChild
            ? at.inst.path
            : base + "/" + segment(view as View.Child<any, any>),
          failedChild,
          status: failedChild ? undefined : statusOf(owner.env),
          kids: at.kids.map((kid) => rec(owner, kid, base))
        }
      }
    }
  }
  return instance(root)
}

const awaitEncoded = (snap: Snap): Effect.Effect<void> => {
  const late: Array<Fiber.Fiber<unknown, SchemaIssue.Issue>> = []
  const visit = (snap: Snap): void => {
    if (snap._tag === "Text") return
    if (
      snap._tag === "Instance" && snap.encoded !== undefined &&
      !Exit.isExit(snap.encoded)
    ) late.push(snap.encoded)
    for (const kid of snap.kids) visit(kid)
  }
  visit(snap)
  if (late.length === 0) return Effect.void
  return Effect.onInterrupt(
    Effect.forEach(late, Fiber.await, { discard: true }),
    () => Fiber.interruptAll(late)
  )
}

const encodedOf = (
  snap: Snap & { readonly _tag: "Instance" }
): Encoded | undefined => {
  const encoded = snap.encoded
  if (encoded === undefined || Exit.isExit(encoded)) return encoded
  return encoded.pollUnsafe() as Encoded | undefined
}

const warned = new WeakMap<object, Set<string>>()
const formatIssue = SchemaIssue.makeFormatterDefault()

const warnOnce = (
  kind: string,
  inst: Kernel.Instance,
  ctx: Context.Context<any>,
  message: () => string
): void => {
  const component = inst.component as unknown as Component.Any
  let kinds = warned.get(component)
  if (kinds === undefined) warned.set(component, kinds = new Set())
  if (kinds.has(kind)) return
  kinds.add(kind)
  Effect.runForkWith(ctx)(
    Effect.logWarning(`${component.definition.name}: ${message()}`)
  )
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

const warnUnencoded = (
  inst: Kernel.Instance,
  ctx: Context.Context<any>,
  cause: Cause.Cause<SchemaIssue.Issue>
) => {
  const error = Cause.findErrorOption(cause)
  if (Option.isSome(error) && error.value === redactedIssue) return
  warnOnce(
    "unencoded",
    inst,
    ctx,
    () =>
      "its state doesn't encode as JSON, so the server sends no state for it and the client builds it and " +
      "everything under it fresh, without hydration, and history doesn't restore it. " +
      Option.match(error, {
        onNone: () => Cause.pretty(cause),
        onSome: formatIssue
      })
  )
}

/** @internal */
export const write = (
  snap: Snap,
  query: unknown,
  ctx: Context.Context<any>,
  isStatic: boolean,
  sink: services.ServerSink
): Effect.Effect<Renderer.State> =>
  Effect.map(awaitEncoded(snap), () => {
    const state: Record<string, unknown> = {}
    const deferredPaths: Array<string> = []
    const statuses: Record<string, string> = {}
    const ship = (path: string, status: Status) => {
      if (status !== undefined) statuses[path] = status
    }
    const visit = (snap: Snap, under: boolean): void => {
      switch (snap._tag) {
        case "Text":
          return sink.text(snap.text)
        case "Element": {
          const view = snap.view
          sink.open(view.tag, view.attrs, view.props)
          for (const kid of snap.kids) visit(kid, under)
          return sink.close(view.tag)
        }
        case "Range": {
          sink.enter(snap.path)
          for (const kid of snap.kids) visit(kid, under)
          return sink.leave(snap.path)
        }
        case "Fallback": {
          if (!under) {
            if (snap.failedChild) deferredPaths.push(snap.path)
            else ship(snap.path, snap.status)
          }
          sink.enter(snap.path)
          for (const kid of snap.kids) visit(kid, true)
          return sink.leave(snap.path)
        }
        case "Instance": {
          const inst = snap.inst
          const path = inst.path
          let inner = under
          if (!under) {
            const exit = encodedOf(snap)
            if (
              stateCodecOf(inst.component as unknown as Component.Any).redacted
            ) warnRedacted(inst, ctx)
            else if (exit !== undefined && Exit.isFailure(exit)) {
              warnUnencoded(inst, ctx, exit.cause)
            }
            if (exit === undefined || Exit.isFailure(exit)) {
              deferredPaths.push(path)
              inner = true
            } else {
              state[path] = exit.value
              ship(path, snap.status)
            }
          }
          const bare = !inner && snap.bare
          if (!bare) {
            sink.enter(path)
          }
          for (const kid of snap.kids) visit(kid, inner)
          if (!bare) sink.leave(path)
        }
      }
    }
    visit(snap, false)
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
