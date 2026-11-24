/**
 * Pure-JS test fakes for `OpenTuiSubscription.GlobalEvents` and `OpenTui.Host`,
 * usable with `TestHost.layer()` without loading OpenTUI's native FFI library.
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as OpenTui from "../OpenTui.ts"
import * as OpenTuiSubscription from "../OpenTuiSubscription.ts"

/**
 * Control interface for firing global OpenTUI events in FFI-free tests.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestOpenTuiEvents {
  /**
   * Fires a `"keypress"` event and returns whether any listener called
   * `preventDefault()`.
   */
  readonly pressKey: (
    key: string,
    details?: Partial<Omit<OpenTui.KeyPayload, "key">>
  ) => boolean
  /**
   * Fires a `"keyrelease"` event and returns whether any listener called
   * `preventDefault()`.
   */
  readonly releaseKey: (
    key: string,
    details?: Partial<Omit<OpenTui.KeyPayload, "key">>
  ) => boolean
  /**
   * Fires a `"paste"` event and returns whether any listener called
   * `preventDefault()`.
   */
  readonly paste: (text: string) => boolean
  /**
   * Fires a `"resize"` event with the given terminal dimensions.
   */
  readonly resize: (width: number, height: number) => void
  /**
   * Fires any event in `OpenTuiSubscription.TerminalEvents`.
   */
  readonly fire: <K extends keyof OpenTuiSubscription.TerminalEvents>(
    event: K,
    payload: Partial<
      OpenTuiSubscription.GlobalPayload<OpenTuiSubscription.TerminalEvents[K]>
    >
  ) => boolean
}

/**
 * The `TestOpenTuiEvents` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestOpenTuiEvents: Context.Service<
  TestOpenTuiEvents,
  TestOpenTuiEvents
> = Context.Service<TestOpenTuiEvents>(
  "@effect/ui-opentui/testing/TestOpenTuiEvents"
)

interface Entry {
  readonly event: keyof OpenTuiSubscription.TerminalEvents
  readonly listener: (payload: any, preventDefault: () => void) => void
}

const defaultKeyPayload = (
  payload: Partial<OpenTuiSubscription.GlobalPayload<OpenTui.KeyPayload>>,
  eventType: "press" | "release"
): OpenTuiSubscription.GlobalPayload<OpenTui.KeyPayload> => ({
  key: payload.key ?? "",
  sequence: payload.sequence ?? payload.key ?? "",
  ctrl: payload.ctrl ?? false,
  shift: payload.shift ?? false,
  meta: payload.meta ?? false,
  option: payload.option ?? false,
  repeat: payload.repeat ?? false,
  eventType: payload.eventType ?? eventType,
  editable: payload.editable ?? false,
  defaultPrevented: payload.defaultPrevented ?? false
})

const buildPayload = <K extends keyof OpenTuiSubscription.TerminalEvents>(
  event: K,
  partial: Partial<
    OpenTuiSubscription.GlobalPayload<OpenTuiSubscription.TerminalEvents[K]>
  >,
  defaultPrevented: boolean
): OpenTuiSubscription.GlobalPayload<OpenTuiSubscription.TerminalEvents[K]> => {
  if (event === "keypress" || event === "keyrelease") {
    return defaultKeyPayload(
      { ...(partial as Partial<OpenTui.KeyPayload>), defaultPrevented },
      event === "keypress" ? "press" : "release"
    ) as any
  }
  if (event === "paste") {
    return {
      text: (partial as Partial<OpenTui.PastePayload>).text ?? "",
      defaultPrevented
    } as any
  }
  const size = partial as Partial<OpenTui.ResizePayload>
  return {
    width: size.width ?? 80,
    height: size.height ?? 24,
    defaultPrevented
  } as any
}

/**
 * Creates a fresh in-memory `OpenTuiSubscription.GlobalEvents` source paired
 * with its `TestOpenTuiEvents` control.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (): OpenTuiSubscription.GlobalEvents & TestOpenTuiEvents => {
  const entries = new Set<Entry>()
  const fire: TestOpenTuiEvents["fire"] = (event, partial) => {
    let prevented = partial.defaultPrevented ?? false
    const preventDefault = () => {
      prevented = true
    }
    for (const entry of Array.from(entries)) {
      if (entry.event !== event || !entries.has(entry)) continue
      entry.listener(buildPayload(event, partial, prevented), preventDefault)
    }
    return prevented
  }
  return {
    listen: (event, listener) => {
      const entry: Entry = { event, listener }
      entries.add(entry)
      return () => {
        entries.delete(entry)
      }
    },
    fire,
    pressKey: (key, details) => fire("keypress", { ...details, key }),
    releaseKey: (key, details) => fire("keyrelease", { ...details, key }),
    paste: (text) => fire("paste", { text }),
    resize: (width, height) => {
      fire("resize", { width, height })
    }
  }
}

/**
 * Recorded imperative `OpenTui.Host` calls captured by {@link makeHostRecorder}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface RecordedHostAction {
  readonly _tag: "Focus" | "Blur" | "ScrollTo" | "ScrollBy" | "Measure" | "Quit"
  readonly node?: unknown
  readonly value?: OpenTui.ScrollPosition | undefined
}

/**
 * Fake `OpenTui.Host` control for `TestHost` tests.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestOpenTuiHost {
  readonly actions: ReadonlyArray<RecordedHostAction>
  readonly rect: (rect: OpenTui.Rect) => void
  readonly clear: () => void
}

/**
 * The `TestOpenTuiHost` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestOpenTuiHost: Context.Service<
  TestOpenTuiHost,
  TestOpenTuiHost
> = Context.Service<TestOpenTuiHost>(
  "@effect/ui-opentui/testing/TestOpenTuiHost"
)

/**
 * Creates a fake `OpenTui.Host` that records all `OpenTuiCommand` calls.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHostRecorder = (
  initialRect: OpenTui.Rect = { x: 0, y: 0, width: 80, height: 24 }
): Context.Service.Shape<typeof OpenTui.Host> & TestOpenTuiHost => {
  const actions: Array<RecordedHostAction> = []
  let currentRect = initialRect
  return {
    actions,
    rect: (next) => {
      currentRect = next
    },
    clear: () => {
      actions.length = 0
    },
    focus: (node) => {
      actions.push({ _tag: "Focus", node })
    },
    blur: (node) => {
      actions.push({ _tag: "Blur", node })
    },
    scrollTo: (node, position) => {
      actions.push({ _tag: "ScrollTo", node, value: position })
    },
    scrollBy: (node, delta) => {
      actions.push({ _tag: "ScrollBy", node, value: delta })
    },
    measure: (node) => {
      actions.push({ _tag: "Measure", node })
      return currentRect
    },
    quit: () => {
      actions.push({ _tag: "Quit" })
    }
  }
}

/**
 * Provides fake `OpenTuiSubscription.GlobalEvents`, `TestOpenTuiEvents`,
 * `OpenTui.Host`, and `TestOpenTuiHost` for zero-FFI `TestHost` tests.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer: Layer.Layer<
  TestOpenTuiEvents | TestOpenTuiHost | OpenTui.Host
> = Layer.effectContext(
  Effect.sync(() => {
    const events = make()
    const host = makeHostRecorder()
    return Context.make(TestOpenTuiEvents, events).pipe(
      Context.add(OpenTuiSubscription.GlobalEvents, events),
      Context.add(TestOpenTuiHost, host),
      Context.add(OpenTui.Host, host)
    )
  })
)

/**
 * Fires a `"keypress"` event through `TestOpenTuiEvents`.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const pressKey = (
  key: string,
  details?: Partial<Omit<OpenTui.KeyPayload, "key">>
): Effect.Effect<boolean, never, TestOpenTuiEvents> =>
  TestOpenTuiEvents.useSync((events) => events.pressKey(key, details))

/**
 * Fires a `"paste"` event through `TestOpenTuiEvents`.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const paste = (
  text: string
): Effect.Effect<boolean, never, TestOpenTuiEvents> =>
  TestOpenTuiEvents.useSync((events) => events.paste(text))

/**
 * Fires a `"resize"` event through `TestOpenTuiEvents`.
 *
 * @stability experimental
 * @category testing
 * @since 0.1.0
 */
export const resize = (
  width: number,
  height: number
): Effect.Effect<void, never, TestOpenTuiEvents> =>
  TestOpenTuiEvents.useSync((events) => events.resize(width, height))
