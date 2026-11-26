import type * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../Component.ts"
import type * as Renderer from "../Renderer.ts"
import type * as View from "../View.ts"
import { runCodec, warnOnce, warnUnencoded } from "./codecRun.ts"
import type * as Kernel from "./kernel.ts"
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

interface ElementSnap extends Array<Snap | View.Element<any, any>> {
  0: View.Element<any, any>
}

type Snap =
  | string
  | ElementSnap
  | {
    readonly _tag: "Instance"
    readonly inst: Kernel.Instance
    readonly encoded:
      | Encoded
      | Fiber.Fiber<Page, SchemaIssue.Issue>
      | undefined
    readonly status: Status
    readonly bare: boolean
    readonly kid: Snap | undefined
    readonly kept: ReadonlyArray<Snap>
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

const noKids: ReadonlyArray<Snap> = []

interface Snapshot {
  readonly root: Snap
  readonly late: ReadonlyArray<Fiber.Fiber<Page, SchemaIssue.Issue>>
}

/** @internal */
export const snapshot = (
  root: Kernel.Instance,
  deferred: ReadonlySet<Kernel.Instance>,
  shippedQuery?: queryCore.ShippedContext | undefined
): Snapshot => {
  const late: Array<Fiber.Fiber<Page, SchemaIssue.Issue>> = []
  const instance = (inst: Kernel.Instance): Snap => {
    const component = inst.component as unknown as Component.Any
    const shipped = inst.failure === undefined && !deferred.has(inst)
    const rendered = inst.rendered
    let kept: Array<Snap> | undefined
    for (const entry of inst.kept?.children() ?? []) {
      if (entry.rec === undefined && !entry.inst.closed) {
        ;(kept ??= []).push(instance(entry.inst))
      }
    }
    const encoded = shipped
      ? runCodec(
        shippedQuery === undefined
          ? encodePage(component, inst.model, inst.results, inst.owning)
          : Effect.provideService(
            encodePage(component, inst.model, inst.results, inst.owning),
            queryCore.Shipped,
            shippedQuery
          )
      )
      : undefined
    if (encoded !== undefined && !Exit.isExit(encoded)) late.push(encoded)
    return {
      _tag: "Instance",
      inst,
      encoded,
      status: component.layer === undefined ? undefined : statusOf(inst.env),
      bare: inst.parent !== undefined && component.layer === undefined &&
        (inst.at!.v as View.Child<any, any>).alive === undefined &&
        rendered?.v._tag === "Element",
      kid: inst.failure === undefined && rendered !== undefined
        ? rec(inst, rendered, inst.path)
        : undefined,
      kept: kept ?? noKids
    }
  }
  const kidsOf = (
    owner: Kernel.Instance,
    kids: ReadonlyArray<Kernel.Rec> | undefined,
    base: string
  ): ReadonlyArray<Snap> => {
    if (kids === undefined) return noKids
    const out: Array<Snap> = new Array(kids.length)
    for (let index = 0; index < kids.length; index++) {
      out[index] = rec(owner, kids[index]!, base)
    }
    return out
  }
  const rec = (owner: Kernel.Instance, at: Kernel.Rec, base: string): Snap => {
    const view = at.v
    switch (view._tag) {
      case "Text":
        return view.text
      case "Element": {
        const kids = at.kids
        if (kids === undefined) return [view]
        const out = new Array(kids.length + 1) as ElementSnap
        out[0] = view
        for (let index = 0; index < kids.length; index++) {
          out[index + 1] = rec(owner, kids[index]!, base)
        }
        return out
      }
      case "Outlet": {
        const path = at.inst.path + "/" + slotSegment(view.name)
        return {
          _tag: "Range",
          path,
          kids: kidsOf(at.inst.parent!, at.kids, path)
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
          kids: kidsOf(owner, at.kids, base)
        }
      }
    }
  }
  return { root: instance(root), late }
}

const awaitEncoded = (
  late: ReadonlyArray<Fiber.Fiber<Page, SchemaIssue.Issue>>
): Effect.Effect<void> =>
  late.length === 0 ? Effect.void : Effect.onInterrupt(
    Effect.forEach(late, Fiber.await, { discard: true }),
    () => Fiber.interruptAll(late)
  )

const encodedOf = (
  snap: Extract<Snap, { readonly _tag: "Instance" }>
): Encoded | undefined => {
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
  { late, root }: Snapshot,
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
    const deferredPaths: Array<string> = []
    const statuses: Record<string, string> = {}
    const collected: Record<string, unknown> = {}
    const ship = (path: string, status: Status) => {
      if (status !== undefined) statuses[path] = status
    }
    const visit = (snap: Snap, under: boolean): void => {
      if (typeof snap === "string") return sink.text(snap)
      if (Array.isArray(snap)) {
        const view = snap[0]
        sink.open(view.tag, view.attrs, view.props)
        for (let index = 1; index < snap.length; index++) {
          visit(snap[index] as Snap, under)
        }
        return sink.close(view.tag)
      }
      switch (snap._tag) {
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
            if (exit === undefined || Exit.isFailure(exit)) {
              if (
                stateCodecOf(inst.component as unknown as Component.Any)
                  .redacted
              ) warnRedacted(inst, ctx)
              else if (exit !== undefined) {
                warnUnencoded(inst, ctx, exit.cause)
              }
              if (into === state) deferredPaths.push(path)
              inner = true
            } else {
              into[path] = exit.value.state
              if (exit.value.reported !== undefined) {
                collected[path] = exit.value.reported
              }
              ship(path, snap.status)
            }
          }
          const bare = !inner && snap.bare
          if (!bare) {
            sink.enter(path)
          }
          if (snap.kid !== undefined) visit(snap.kid, inner)
          if (!bare) sink.leave(path)
          if (snap.kept.length === 0) return
          const was = into
          const byChild: Record<string, unknown> = {}
          ;(was === state
            ? kept
            : (was["~kept"] ??= {}) as Record<string, unknown>)[path] = byChild
          sink = mute
          for (const kid of snap.kept) {
            into = byChild[(kid as typeof snap).inst.path] = {}
            visit(kid, inner)
          }
          into = was
          if (was === state) sink = to
        }
      }
    }
    visit(root, false)
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
