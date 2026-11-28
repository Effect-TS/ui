/**
 * A stand-in for React Native's `NativeAnimatedModule` that evaluates the
 * node graph as native does, so tests read what a view shows. It throws
 * where native would fail or leak: a node created twice, an edge or a view
 * connection to a missing node, or a node dropped while still connected
 * or bound to an event. Like native, binding `onScroll` also binds
 * `onScrollEnded`, which removing `onScroll` removes only on Android.
 *
 * Like native, a view keeps the values the driver last showed for its keys
 * after the driver disconnects. With `ios` on, it holds graph operations
 * until an operation iOS flushes: starting, stopping or setting a value.
 */
type Config = Record<string, any>

export const make = () => {
  const nodes = new Map<number, Config & { value?: number }>()
  const parents = new Map<number, Array<number>>()
  const views = new Map<number, number>()
  const events = new Map<string, number>()
  const running = new Map<
    number,
    {
      node: number
      from: number
      toValue: number
      end: (r: { finished: boolean }) => void
    }
  >()
  const kept = new Map<number, Record<string, unknown>>()
  const queued: Array<() => void> = []
  let ios = false
  let open = false
  const need = (tag: number) => {
    const node = nodes.get(tag)
    if (node === undefined) throw new Error("no animated node " + tag)
    return node
  }
  const stop = (id: number) => {
    const animation = running.get(id)
    if (animation === undefined) return
    running.delete(id)
    animation.end({ finished: false })
  }
  const value = (tag: number): number => {
    const node = need(tag)
    switch (node.type) {
      case "value":
        return node.value!
      case "addition":
        return value(node.input[0]) + value(node.input[1])
      case "multiplication":
        return value(node.input[0]) * value(node.input[1])
      case "diffclamp":
        return Math.min(Math.max(value(node.input), node.min), node.max)
      case "interpolation": {
        const x = value(parents.get(tag)![0]!)
        const at = node.inputRange
        const to = node.outputRange
        const last = at.length - 1
        let k = 1
        while (k < last && x > at[k]) k++
        let t = (x - at[k - 1]) / (at[k] - at[k - 1])
        if (node.extrapolateLeft === "clamp") t = Math.max(t, 0)
        if (node.extrapolateRight === "clamp") t = Math.min(t, 1)
        return to[k - 1] + t * (to[k] - to[k - 1])
      }
    }
    throw new Error("not a value node " + tag)
  }
  const style = (tag: number) => {
    const out: Record<string, unknown> = {}
    for (const [key, at] of Object.entries(need(tag).style as object)) {
      out[key] = key === "transform"
        ? need(at).transforms.map((t: Config) => ({
          [t.property]: value(t.nodeTag)
        }))
        : value(at)
    }
    return out
  }
  const module = {
    startOperationBatch() {
      if (open) throw new Error("batch started twice")
      open = true
    },
    finishOperationBatch() {
      if (!open) throw new Error("no batch to finish")
      open = false
    },
    createAnimatedNode(tag: number, config: Config) {
      if (nodes.has(tag)) throw new Error("node " + tag + " exists")
      nodes.set(tag, { ...config })
    },
    connectAnimatedNodes(parent: number, child: number) {
      need(parent)
      need(child)
      parents.set(child, [...(parents.get(child) ?? []), parent])
    },
    disconnectAnimatedNodes(parent: number, child: number) {
      const list = parents.get(child) ?? []
      if (!list.includes(parent)) {
        throw new Error("no edge " + parent + "->" + child)
      }
      parents.set(child, list.filter((p) => p !== parent))
    },
    connectAnimatedNodeToView(tag: number, view: number) {
      if (need(tag).type !== "props") throw new Error("not a props node")
      views.set(view, tag)
    },
    disconnectAnimatedNodeFromView(tag: number, view: number) {
      if (views.get(view) !== tag) throw new Error("not connected " + tag)
      kept.set(view, shown(view)!)
      views.delete(view)
    },
    dropAnimatedNode(tag: number) {
      need(tag)
      for (const at of [...views.values(), ...events.values()]) {
        if (at === tag) throw new Error("dropped connected node " + tag)
      }
      for (const [child, list] of parents) {
        if (list.includes(tag) && nodes.has(child)) {
          throw new Error("dropped node " + tag + " still feeds " + child)
        }
      }
      nodes.delete(tag)
      parents.delete(tag)
    },
    startAnimatingNode(
      id: number,
      tag: number,
      config: Config,
      end: (r: { finished: boolean }) => void
    ) {
      if (need(tag).type !== "value") throw new Error("not a value node")
      running.set(id, {
        node: tag,
        from: value(tag),
        toValue: config.toValue,
        end
      })
    },
    stopAnimation: stop,
    setAnimatedNodeValue(tag: number, to: number) {
      for (const [id, a] of running) if (a.node === tag) stop(id)
      need(tag).value = to
    },
    addAnimatedEventToView(view: number, event: string, mapping: Config) {
      need(mapping.animatedValueTag)
      const key = view + ":" + event + ":" + mapping.nativeEventPath.join(".")
      if (events.has(key)) throw new Error("event bound twice " + key)
      events.set(key, mapping.animatedValueTag)
      if (event === "onScroll") {
        module.addAnimatedEventToView(view, "onScrollEnded", mapping)
      }
    },
    removeAnimatedEventFromView(view: number, event: string, tag: number) {
      if (event === "onScroll" && !ios) {
        module.removeAnimatedEventFromView(view, "onScrollEnded", tag)
      }
      for (const [key, at] of events) {
        if (at === tag && key.startsWith(view + ":" + event + ":")) {
          return void events.delete(key)
        }
      }
      throw new Error("no event " + view + event)
    }
  }
  const shown = (view: number) => {
    const props = views.get(view)
    const live = props === undefined
      ? undefined
      : style(need(props).props.style)
    return live === undefined ? kept.get(view) : { ...kept.get(view), ...live }
  }
  const flushed = [
    "startAnimatingNode",
    "stopAnimation",
    "setAnimatedNodeValue"
  ]
  const deferred = Object.fromEntries(
    Object.entries(module).map(([name, op]) => [
      name,
      (...args: Array<any>) => {
        if (!ios || name.endsWith("OperationBatch")) return (op as any)(...args)
        queued.push(() => (op as any)(...args))
        if (flushed.includes(name)) {
          for (const run of queued.splice(0)) run()
        }
      }
    ])
  ) as typeof module
  return {
    module: deferred,
    /** Holds graph operations as iOS does, until one it flushes. */
    ios: (on: boolean) => {
      ios = on
    },
    /** The animated props view `tag` shows, live or kept from the driver. */
    view: shown,
    /** Delivers a scroll event from view `tag` to the values bound to it. */
    scroll: (
      tag: number,
      offset: { readonly x?: number; readonly y?: number }
    ) => {
      for (const axis of ["x", "y"] as const) {
        const at = events.get(tag + ":onScroll:contentOffset." + axis)
        if (at !== undefined) need(at).value = offset[axis] ?? 0
      }
    },
    /** Moves every animation `t` of the way from its start to its end. */
    progress: (t: number) => {
      for (const a of running.values()) {
        need(a.node).value = a.from + (a.toValue - a.from) * t
      }
    },
    /** Runs every animation to its end. */
    finish: () => {
      for (const [id, a] of running) {
        running.delete(id)
        need(a.node).value = a.toValue
        a.end({ finished: true })
      }
    },
    running: () => running.size,
    nodes: () => nodes.size,
    events: () => events.size
  }
}
