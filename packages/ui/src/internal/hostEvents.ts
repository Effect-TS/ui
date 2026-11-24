/**
 * A host's side of `Renderer.HostEvents`: the lookups its mounts connect, and the events `setEvents` is
 * given by a caller that connects none.
 *
 * @internal
 */
import type * as Renderer from "../Renderer.ts"

/** @internal */
export interface Store<Node> {
  /** The events of each node of `path`, innermost first: what a mount's lookup finds, then what `set` kept. */
  readonly along: (
    path: ReadonlyArray<Node>
  ) => ReadonlyArray<Renderer.Events | undefined>
  readonly connect: Renderer.HostEvents<Node>["connect"]
  /** Keeps the events `setEvents` gave `node`, or with `undefined`, drops them. */
  readonly set: (node: Node, events: Renderer.Events | undefined) => void
}

/** @internal */
export const make = <Node extends object>(): Store<Node> => {
  const lookups: Array<Store<Node>["along"]> = []
  // Weak, so a node the page keeps after the app is gone doesn't keep the app's dispatch alive.
  const bound = new WeakMap<Node, Renderer.Events>()
  let anyBound = false
  return {
    along(path) {
      // One mount and nothing from `setEvents`, as in an app: its lookup's answer as it is.
      if (lookups.length === 1 && !anyBound) return lookups[0]!(path)
      const out: Array<Renderer.Events | undefined> = new Array(path.length)
      for (const lookup of lookups) {
        const found = lookup(path)
        for (let i = 0; i < path.length; i++) out[i] ??= found[i]
      }
      if (anyBound) {
        for (let i = 0; i < path.length; i++) out[i] ??= bound.get(path[i]!)
      }
      return out
    },
    connect(lookup) {
      lookups.push(lookup)
      return () => {
        const index = lookups.indexOf(lookup)
        if (index >= 0) lookups.splice(index, 1)
      }
    },
    set(node, events) {
      if (events === undefined) bound.delete(node)
      else {
        anyBound = true
        bound.set(node, events)
      }
    }
  }
}
