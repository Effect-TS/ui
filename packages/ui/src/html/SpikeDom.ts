/**
 * SPIKE (EFF-4218), not for release. A DOM host for `Kernel`: nodes, attributes, properties and one
 * listener for each event name on the container. A handler that is a function is given the DOM event.
 *
 * Left out, each to arrive with what uses it: event payloads, controlled form properties, dialogs and
 * popovers, files and images, view transitions, the head and hydration.
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import type * as Component from "../Component.ts"
import * as Kernel from "../spike/Kernel.ts"
import type * as View from "../View.ts"
import { attributeName, svgTags } from "./internal/elements.ts"

const SVG = "http://www.w3.org/2000/svg"

/**
 * A kernel host over `container`'s document, and what removes its listeners.
 *
 * @stability experimental
 */
export const makeHost = (
  container: globalThis.Element
): Kernel.Host<globalThis.Node> & { readonly dispose: () => void } => {
  const document = container.ownerDocument
  const listening = new Set<string>()
  const listener = (event: Event): void => {
    const name = event.type
    let node = event.target as (globalThis.Node & { $r?: Kernel.Rec }) | null
    while (node !== null && node !== container) {
      const rec = node.$r
      if (rec !== undefined) {
        const view = rec.v as View.Element<any, any>
        const handler = view.handlers[name]
        if (handler !== undefined) {
          const prevents = view.eventOptions[name]?.preventDefault
          if ((rec.inst.fire(handler, event) && prevents === true) || prevents === "always") event.preventDefault()
        }
      }
      if (!event.bubbles || event.cancelBubble) return
      node = node.parentNode
    }
  }
  return {
    createElement: (tag) => svgTags.has(tag) ? document.createElementNS(SVG, tag) : document.createElement(tag),
    createText: (text) => document.createTextNode(text),
    setText(node, text) {
      ;(node as globalThis.Text).data = text
    },
    setAttr(node, name, value) {
      const element = node as globalThis.Element
      const normalized = attributeName(name, element.namespaceURI === SVG)
      if (normalized === undefined) return
      if (value === undefined) element.removeAttribute(normalized)
      else element.setAttribute(normalized, value)
    },
    setProp(node, name, value) {
      const element = node as any
      element[name] = value === undefined ? (typeof element[name] === "boolean" ? false : "") : value
    },
    setEvents(node, record, first) {
      if (first) (node as { $r?: Kernel.Rec }).$r = record
      for (const name in (record.v as View.Element<any, any>).handlers) {
        if (listening.has(name)) continue
        listening.add(name)
        // Capturing, so an event that doesn't bubble is seen too.
        container.addEventListener(name, listener, true)
      }
    },
    insert(parent, node, before) {
      parent.insertBefore(node, before)
    },
    remove(parent, node) {
      parent.removeChild(node)
    },
    clear(parent) {
      parent.textContent = ""
    },
    parentOf: (node) => node.parentNode!,
    dispose() {
      for (const name of listening) container.removeEventListener(name, listener, true)
    }
  }
}

/**
 * What `mountEffect` returns.
 *
 * @stability experimental
 */
export interface Root<Model, Msg> {
  readonly path: string
  readonly model: () => Model | undefined
  readonly send: (message: Msg) => void
}

const report: Kernel.Tree["report"] = (path, where, error) =>
  reportError(new Error("[@effect/ui] " + path + " failed in " + where, { cause: error }))

/**
 * Mounts `component` into `container` until the Scope closes.
 *
 * @stability experimental
 */
export const mountEffect = <Props, Model, Msg>(
  component: Component.Members<any, Props, Model, Msg, any, never, any, any>,
  props: Props,
  container: globalThis.Element
): Effect.Effect<Root<Model, Msg>, never, Scope.Scope> =>
  Effect.map(
    Effect.acquireRelease(
      Effect.sync(() => {
        const host = makeHost(container)
        return { host, root: Kernel.mount(component as unknown as Kernel.Runnable, props, container, host, report) }
      }),
      ({ host, root }) =>
        Effect.sync(() => {
          root.close()
          host.dispose()
        })
    ),
    ({ root }) => ({
      path: root.instance.path,
      model: () => root.instance.model as Model | undefined,
      send: root.send
    })
  )

/**
 * Mounts `component` into `container` for as long as the Layer is built.
 *
 * @stability experimental
 */
export const mount = <Props, Model, Msg>(
  component: Component.Members<any, Props, Model, Msg, any, never, any, any>,
  props: Props,
  container: globalThis.Element
): Layer.Layer<never> => Layer.effectDiscard(mountEffect(component, props, container))
