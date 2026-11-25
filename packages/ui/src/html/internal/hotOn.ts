import * as Cause from "effect/Cause"
import type * as Component from "../../Component.ts"
import { formatCause, isRedacted } from "../../internal/codecRun.ts"
import type * as keptRun from "../../internal/keptRun.ts"
import type * as Kernel from "../../internal/kernel.ts"
import type * as runtime from "../../internal/runtime.ts"
import * as stateRestore from "../../internal/stateRestore.ts"
import type * as MessageLog from "../../MessageLog.ts"
import type * as BrowserHost from "../BrowserHost.ts"

const hotKey = Symbol.for("@effect/ui/hot")
const devToolsKey = Symbol.for("@effect/ui/devtools")
const storageKey = "@effect/ui/hot"

export interface DevToolsHook {
  readonly messageLog: MessageLog.MessageLog
  readonly controllables: BrowserHost.Controllables
}

export const devTools = (
  container: globalThis.Element
): DevToolsHook | undefined => {
  const view = container.ownerDocument.defaultView
  if (view === null || view !== globalThis.window) return undefined
  return (view as unknown as Record<symbol, DevToolsHook | undefined>)[
    devToolsKey
  ]
}

interface SavedRoot {
  readonly path: string
  readonly containerId: string | undefined
  readonly data: stateRestore.Saved
  readonly warnings: ReadonlyArray<string>
}

interface HotPayload {
  readonly version: 1
  readonly url: string
  readonly scroll?: { readonly x: number; readonly y: number } | undefined
  readonly roots: Array<SavedRoot>
  readonly error?: string | undefined
}

interface WindowState {
  readonly roots: Set<() => SavedRoot | undefined>
  pending: HotPayload | undefined
  scroll: HotPayload["scroll"]
}

const states = new WeakMap<Window, WindowState>()

const warn = (message: string) => {
  // oxlint-disable-next-line no-console
  console.warn(message)
}

const urlOf = (view: Window): string =>
  view.location.pathname + view.location.search

const takeStorage = (view: Window): string | null => {
  try {
    const raw = view.sessionStorage.getItem(storageKey)
    if (raw !== null) view.sessionStorage.removeItem(storageKey)
    return raw
  } catch {
    return null
  }
}

const writeStorage = (view: Window, payload: HotPayload): boolean => {
  try {
    view.sessionStorage.setItem(storageKey, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

const parsePayload = (raw: string): HotPayload | undefined => {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.version === 1 && typeof parsed.url === "string" &&
        Array.isArray(parsed.roots)
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

const saveWindow = (view: Window, state: WindowState): void => {
  // Keep any snapshot from before a broken reload until a replacement mounts.
  if (state.roots.size === 0) return
  state.pending = undefined
  state.scroll = undefined
  const roots: Array<SavedRoot> = []
  for (const capture of state.roots) {
    const captured = capture()
    if (captured !== undefined) roots.push(captured)
  }
  if (roots.length === 0) return
  const url = urlOf(view)
  const scroll = { x: view.scrollX, y: view.scrollY }
  if (writeStorage(view, { version: 1, url, scroll, roots })) return
  writeStorage(view, {
    version: 1,
    url,
    roots: [],
    error:
      "[@effect/ui] hot reload: saved state could not be written to sessionStorage, so the app restarted from init."
  })
}

const stateOf = (view: Window): WindowState => {
  let state = states.get(view)
  if (state === undefined) {
    const made: WindowState = {
      roots: new Set(),
      pending: undefined,
      scroll: undefined
    }
    states.set(view, state = made)
    ;(view as unknown as Record<symbol, (() => void) | undefined>)[hotKey] ??=
      () => saveWindow(view, made)
  }
  return state
}

const loadPending = (
  view: Window,
  state: WindowState
): HotPayload | undefined => {
  const raw = takeStorage(view)
  if (raw !== null) {
    const parsed = parsePayload(raw)
    state.pending = parsed?.url === urlOf(view) ? parsed : undefined
    state.scroll = state.pending?.scroll
    if (state.pending?.error !== undefined) warn(state.pending.error)
  }
  return state.pending
}

const takeRoot = (
  pending: HotPayload | undefined,
  path: string,
  containerId: string | undefined
): SavedRoot | undefined => {
  const index =
    pending?.roots.findIndex((entry) =>
      entry.path === path && entry.containerId === containerId
    ) ?? -1
  return index < 0 ? undefined : pending!.roots.splice(index, 1)[0]
}

const restoreScroll = (view: Window, state: WindowState): void => {
  const scroll = state.scroll
  if (scroll === undefined) return
  state.scroll = undefined
  if (scroll.x === 0 && scroll.y === 0) return
  view.requestAnimationFrame(() => view.scrollTo(scroll.x, scroll.y))
}

const interruptedIn = (
  inst: Kernel.Instance,
  out: Array<string> = []
): Array<string> => {
  for (const run of inst.runs?.pending() ?? []) {
    out.push(`${inst.path} (${run.name})`)
  }
  for (const child of stateRestore.childrenOf(inst.rendered)) {
    interruptedIn(child, out)
  }
  const kept = inst.kept as keptRun.Table | undefined
  for (const entry of kept?.kids.values() ?? []) {
    if (!entry.inst.closed) interruptedIn(entry.inst, out)
  }
  return out
}

const restarted = (inst: Kernel.Instance, why: string): string =>
  `[@effect/ui] hot reload: ${inst.path} restarted from init. ${why}`

export const open = (
  component: Component.Any,
  container: globalThis.Element
): runtime.HotSession | undefined => {
  const view = container.ownerDocument.defaultView
  if (view === null || view !== globalThis.window) return undefined
  const path = "/" + component.definition.name
  const containerId = container.id === "" ? undefined : container.id
  const windowState = stateOf(view)
  const claimed = takeRoot(loadPending(view, windowState), path, containerId)
  for (const message of claimed?.warnings ?? []) warn(message)
  const adopting = claimed !== undefined
  let active = adopting
  let restoring = claimed?.data
  let warnings: Array<string> = []
  let instance: Kernel.Instance | undefined
  const restore = stateRestore.make({
    rootPath: path,
    entry: () => restoring,
    restore: (at) => {
      const found = restoring && stateRestore.pageAt(restoring, at)
      if (found !== undefined) delete restoring![at]
      return found
    },
    onEncodeFailure: (inst, cause) => {
      warnings.push(restarted(
        inst,
        isRedacted(cause)
          ? "Its Model holds a Schema.Redacted, which isn't written to sessionStorage."
          : `Its state doesn't encode as JSON: ${formatCause(cause)}`
      ))
    },
    onAsyncEncode: (inst) => {
      warnings.push(restarted(
        inst,
        "Its state encodes asynchronously, so it couldn't be saved before reload."
      ))
      return false
    },
    onRestoreThrow: (inst, error) => {
      warnings.push(restarted(
        inst,
        `Its restore threw: ${Cause.pretty(Cause.die(error))}`
      ))
    },
    onDecodeFailure: (inst, cause) =>
      warn(restarted(
        inst,
        `Its saved state no longer decodes: ${formatCause(cause)}`
      ))
  })
  const capture = (): SavedRoot | undefined => {
    if (instance === undefined || instance.closed) return undefined
    const data: stateRestore.Saved = {}
    warnings = []
    restore.snapshot(instance, data)
    const interrupted = interruptedIn(instance)
    if (interrupted.length > 0) {
      warnings.push(
        "[@effect/ui] hot reload: interrupted in-flight Commands: " +
          interrupted.join(", ")
      )
    }
    return { path, containerId, data, warnings }
  }
  return {
    get hasSnapshot() {
      return active
    },
    init: (inst, first) => {
      if (!active) return undefined
      const next = restore.init(inst, first)
      return restore.restored(inst)
        ? { model: next.model, commands: [], events: [] }
        : next
    },
    restored: restore.restored,
    hold: (owner, rec, at) => active ? restore.hold(owner, rec, at) : undefined,
    attach: (inst) => {
      instance = inst
      restore.watch(inst.tree)
      windowState.roots.add(capture)
    },
    flushed: (buildsPendingSince) => {
      if (
        restoring === undefined &&
        (!adopting || windowState.scroll === undefined)
      ) return
      if (buildsPendingSince(0) !== 0 || restore.holding()) return
      if (adopting) restoreScroll(view, windowState)
      restoring = undefined
    },
    clear: () => {
      restoring = undefined
      active = false
      restore.clear()
    },
    detach: () => {
      instance = undefined
      windowState.roots.delete(capture)
    }
  }
}
