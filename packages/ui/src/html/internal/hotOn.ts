import * as Cause from "effect/Cause"
import type * as Context from "effect/Context"
import * as Option from "effect/Option"
import * as SchemaIssue from "effect/SchemaIssue"
import type * as Component from "../../Component.ts"
import type * as Kernel from "../../internal/kernel.ts"
import type * as runtime from "../../internal/runtime.ts"
import type * as services from "../../internal/services.ts"
import { redactedIssue } from "../../internal/stateCodec.ts"
import * as stateRestore from "../../internal/stateRestore.ts"

const hotKey = Symbol.for("@effect/ui/hot")
const storageKey = "@effect/ui/hot"

interface HotSlot {
  active: boolean
  save: (() => void) | null
}

interface SavedRoot {
  readonly path: string
  readonly containerId?: string | undefined
  readonly data: stateRestore.Saved
  readonly warnings?: ReadonlyArray<string> | undefined
  readonly interrupted?:
    | ReadonlyArray<{ readonly path: string; readonly name: string }>
    | undefined
}

interface HotPayload {
  readonly version: 1
  readonly url: string
  readonly scroll?: { readonly x: number; readonly y: number } | undefined
  readonly roots: Array<SavedRoot>
  readonly error?: string | undefined
}

interface LiveRoot {
  readonly path: string
  readonly container: globalThis.Element
  readonly capture: () => SavedRoot | undefined
}

interface WindowState {
  readonly roots: Set<LiveRoot>
  pending: HotPayload | undefined
  scrolled: boolean
}

const states = new WeakMap<Window, WindowState>()

const formatIssue = SchemaIssue.makeFormatterDefault()

const warn = (message: string) => {
  // oxlint-disable-next-line no-console
  console.warn(message)
}

const formatCause = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.findErrorOption(cause)
  return Option.match(error, {
    onNone: () => Cause.pretty(cause),
    onSome: (issue) =>
      SchemaIssue.isIssue(issue) ? formatIssue(issue) : String(issue)
  })
}

const urlOf = (view: Window): string =>
  view.location.pathname + view.location.search

const readStorage = (view: Window): string | null => {
  try {
    return view.sessionStorage.getItem(storageKey)
  } catch {
    return null
  }
}

const writeStorage = (view: Window, value: string): boolean => {
  try {
    view.sessionStorage.setItem(storageKey, value)
    return true
  } catch {
    return false
  }
}

const removeStorage = (view: Window): void => {
  try {
    view.sessionStorage.removeItem(storageKey)
  } catch {
    return
  }
}

const parsePayload = (raw: string): HotPayload | undefined => {
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed === "object" && parsed !== null && parsed.version === 1 &&
      typeof parsed.url === "string" && Array.isArray(parsed.roots)
    ) {
      return parsed as HotPayload
    }
  } catch {
    // Corrupted storage entry is ignored.
  }
  return undefined
}

const saveWindow = (view: Window, state: WindowState): void => {
  // Keep any snapshot from before a broken reload until a replacement mounts.
  if (state.roots.size === 0) return
  state.pending = undefined
  state.scrolled = false
  const roots: Array<SavedRoot> = []
  for (const live of state.roots) {
    const captured = live.capture()
    if (captured !== undefined) roots.push(captured)
  }
  if (roots.length === 0) return
  const payload: HotPayload = {
    version: 1,
    url: urlOf(view),
    scroll: { x: view.scrollX, y: view.scrollY },
    roots
  }
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(payload)
  } catch {
    serialized = undefined
  }
  if (serialized !== undefined && writeStorage(view, serialized)) return
  writeStorage(
    view,
    JSON.stringify({
      version: 1,
      url: urlOf(view),
      roots: [],
      error:
        "[@effect/ui] hot reload: saved state could not be written to sessionStorage, so the app restarted from init."
    } satisfies HotPayload)
  )
}

const stateOf = (view: Window): WindowState => {
  let state = states.get(view)
  if (state === undefined) {
    state = { roots: new Set(), pending: undefined, scrolled: false }
    states.set(view, state)
  }
  const host = view as unknown as Record<symbol, HotSlot | undefined>
  const slot = host[hotKey] ??
    (host[hotKey] = { active: false, save: null })
  if (slot.save === null) {
    const current = state
    slot.save = () => saveWindow(view, current)
  }
  return state
}

const loadPending = (
  view: Window,
  state: WindowState
): HotPayload | undefined => {
  const raw = readStorage(view)
  if (raw !== null) {
    removeStorage(view)
    const parsed = parsePayload(raw)
    if (parsed !== undefined && parsed.url === urlOf(view)) {
      state.pending = parsed
      state.scrolled = false
      if (parsed.error !== undefined) warn(parsed.error)
    } else {
      state.pending = undefined
    }
  }
  return state.pending
}

const takeRoot = (
  pending: HotPayload | undefined,
  path: string,
  containerId: string | undefined
): SavedRoot | undefined => {
  if (pending === undefined || pending.roots.length === 0) return undefined
  let index = containerId === undefined
    ? -1
    : pending.roots.findIndex((entry) =>
      entry.path === path && entry.containerId === containerId
    )
  if (index < 0) {
    index = pending.roots.findIndex((entry) => entry.path === path)
  }
  if (index < 0) return undefined
  return pending.roots.splice(index, 1)[0]
}

const restoreScroll = (view: Window, state: WindowState): void => {
  const scroll = state.pending?.scroll
  if (state.scrolled || scroll === undefined) return
  state.scrolled = true
  if (scroll.x === 0 && scroll.y === 0) return
  if (typeof view.scrollTo !== "function") return
  const apply = () => view.scrollTo(scroll.x, scroll.y)
  if (typeof view.requestAnimationFrame === "function") {
    view.requestAnimationFrame(apply)
  } else {
    apply()
  }
}

export const open = (
  component: Component.Any,
  container: globalThis.Element,
  ctx: Context.Context<any>
): runtime.HotSession | undefined => {
  const view = container.ownerDocument.defaultView
  if (view === null || view !== globalThis.window) return undefined
  const path = "/" + component.definition.name
  const containerId = container.id === "" ? undefined : container.id
  const windowState = stateOf(view)
  const pending = loadPending(view, windowState)
  const claimed = takeRoot(pending, path, containerId)
  if (claimed !== undefined) {
    for (const message of claimed.warnings ?? []) warn(message)
    if (claimed.interrupted !== undefined && claimed.interrupted.length > 0) {
      warn(
        "[@effect/ui] hot reload: interrupted in-flight Commands: " +
          claimed.interrupted.map((item) => `${item.path} (${item.name})`)
            .join(", ")
      )
    }
  }
  let restoring: stateRestore.Saved | undefined = claimed === undefined
    ? undefined
    : { ...claimed.data }
  let warnings: Array<string> | undefined
  let instance: Kernel.Instance | undefined
  const restore = stateRestore.make({
    rootPath: path,
    ctx,
    entry: () => restoring,
    restore: (at): services.PageState | undefined => {
      if (restoring === undefined) return undefined
      const found = restoring[at]
      if (found === undefined) return undefined
      delete restoring[at]
      return {
        state: found,
        reported: (restoring["~reported"] as stateRestore.Saved | undefined)
          ?.[at]
      }
    },
    onEncodeFailure: (inst, cause) => {
      const error = Cause.findErrorOption(cause)
      if (Option.isSome(error) && error.value === redactedIssue) {
        warnings?.push(
          `[@effect/ui] hot reload: ${inst.path} restarted from init. Its Model holds a Schema.Redacted, which isn't written to sessionStorage.`
        )
        return
      }
      warnings?.push(
        `[@effect/ui] hot reload: ${inst.path} restarted from init. Its state doesn't encode as JSON: ${
          formatCause(cause)
        }`
      )
    },
    onAsyncEncode: (inst) => {
      warnings?.push(
        `[@effect/ui] hot reload: ${inst.path} restarted from init. Its state encodes asynchronously, so it couldn't be saved before reload.`
      )
      return false
    },
    onRestoreThrow: (inst, error) => {
      warnings?.push(
        `[@effect/ui] hot reload: ${inst.path} restarted from init. Its restore threw: ${
          Cause.pretty(Cause.die(error))
        }`
      )
    },
    onDecodeFailure: (inst, cause) => {
      warn(
        `[@effect/ui] hot reload: ${inst.path} restarted from init. Its saved state no longer decodes: ${
          formatCause(cause)
        }`
      )
    }
  })

  const live: LiveRoot = {
    path,
    container,
    capture: () => {
      if (instance === undefined || instance.closed) return undefined
      const data: stateRestore.Saved = {}
      const collected: Array<string> = []
      warnings = collected
      try {
        restore.snapshot(instance, data)
      } finally {
        warnings = undefined
      }
      const interrupted = stateRestore.pendingOf(instance).map((item) => ({
        path: item.path,
        name: item.name
      }))
      return {
        path,
        ...(containerId === undefined ? undefined : { containerId }),
        data,
        ...(collected.length === 0 ? undefined : { warnings: collected }),
        ...(interrupted.length === 0 ? undefined : { interrupted })
      }
    }
  }

  let active = claimed !== undefined
  return {
    get hasSnapshot() {
      return active
    },
    init: (inst, first) =>
      active ? restore.init(inst, first, false) : undefined,
    restored: restore.restored,
    hold: (owner, rec, at) => active && restore.hold(owner, rec, at),
    attach: (inst) => {
      instance = inst
      const ended = inst.tree.ended
      inst.tree.ended = (author, at) => {
        ended?.(author, at)
        restore.ended(author, at)
      }
      windowState.roots.add(live)
      if (claimed !== undefined) restoreScroll(view, windowState)
    },
    flushed: (buildsPending) => {
      if (buildsPending === 0 && restoring !== undefined) {
        restoring = undefined
        if (windowState.pending?.roots.length === 0) {
          windowState.pending = undefined
        }
      }
    },
    clear: () => {
      restoring = undefined
      active = false
      restore.clear()
    },
    detach: () => {
      instance = undefined
      windowState.roots.delete(live)
    }
  }
}
