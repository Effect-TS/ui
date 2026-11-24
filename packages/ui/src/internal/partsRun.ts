import { checkLayers, dev } from "#dev"
import type * as View from "../View.ts"
import * as Kernel from "./kernel.ts"

interface Layer {
  readonly inst: Kernel.Instance
  readonly handler: unknown
  readonly prevents: boolean
}

/** @internal */
export class Layered {
  readonly layers: Array<Layer> = []
  "~fire"(payload: unknown, event: string, onMessage?: () => void): boolean {
    let sent = false
    let told = false
    for (const layer of this.layers) {
      if (!layer.inst.fire(layer.handler, payload, event)) continue
      sent = true
      if (layer.prevents && !told) {
        told = true
        onMessage?.()
      }
    }
    return sent
  }
}

interface Running {
  readonly owner: unknown
  readonly name: string
  readonly rec: Kernel.Rec
  readonly mount: Kernel.Attachable
}

const running = new WeakMap<Kernel.Rec, Array<Running>>()

class Mounts implements Kernel.Attachable {
  readonly own: Kernel.Attachable | undefined
  readonly owned: ReadonlyArray<View.Owned>
  constructor(
    own: Kernel.Attachable | undefined,
    owned: ReadonlyArray<View.Owned>
  ) {
    this.own = own
    this.owned = owned
  }
  "~attach"(rec: Kernel.Rec): void {
    const was = running.get(rec) ?? []
    const next: Array<Running> = []
    if (this.own !== undefined) this.own["~attach"](rec)
    for (const { owner, mount } of this.owned) {
      if (mount === undefined) continue
      const name = mount.name
      const at = was.find((entry) =>
        entry.owner === owner && entry.name === name
      )?.rec ??
        new Kernel.Rec(rec.v, rec.node, undefined, owner as Kernel.Instance)
      ;(mount as unknown as Kernel.Attachable)["~attach"](at)
      next.push({
        owner,
        name,
        rec: at,
        mount: mount as unknown as Kernel.Attachable
      })
    }
    for (const entry of was) {
      if (!next.some((kept) => kept.rec === entry.rec)) {
        entry.mount["~detach"](entry.rec)
      }
    }
    running.set(rec, next)
  }
  "~detach"(rec: Kernel.Rec): void {
    this.own?.["~detach"](rec)
    for (const entry of running.get(rec) ?? []) {
      entry.mount["~detach"](entry.rec)
    }
    running.delete(rec)
  }
}

/** @internal */
export const layer = (
  inst: Kernel.Instance,
  view: View.Element<any, any>
): View.Element<any, any> => {
  const owned = view.owned ?? []
  const mount = new Mounts(view.mount as any, owned) as unknown as View.Mount<
    any
  >
  if (owned.length === 0) {
    return { ...view, mount }
  }
  const layers = [
    ...owned.slice().sort((a, b) => b.owner.path.length - a.owner.path.length),
    view
  ]
  if (dev) checkLayers(inst, layers)
  const handlers: Record<string, Layered> = {}
  const options: Record<string, Record<string, unknown>> = {}
  for (const layer of layers) {
    const target = layer === view
      ? inst
      : (layer as View.Owned).owner as Kernel.Instance
    for (const event in layer.handlers) {
      ;(handlers[event] ??= new Layered()).layers.push({
        inst: target,
        handler: layer.handlers[event],
        prevents: layer.eventOptions[event]?.preventDefault === true
      })
    }
    for (const event in layer.eventOptions) {
      const merged = options[event] ??= {}
      const option = layer.eventOptions[event] as Record<string, unknown>
      for (const key in option) {
        const value = option[key]
        if (
          value !== undefined &&
          (key !== "preventDefault" || value === "always" ||
            (merged[key] !== "always" && merged[key] !== true))
        ) merged[key] = value
      }
    }
  }
  return { ...view, handlers: handlers as any, eventOptions: options, mount }
}

/** @internal */
export const failed = (owner: View.Owner, error: unknown): View.Text => {
  const inst = owner as Kernel.Instance
  Kernel.failLater(inst, error)
  return blank
}

const blank: View.Text = { _tag: "Text", text: "" }
