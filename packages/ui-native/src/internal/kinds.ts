import type { ViewHost, ViewKind } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

const horizontal = (n: NativeNode, host: ViewHost): boolean =>
  host.os === "android" && n.props.horizontal === true

const scroll: ViewKind = {
  viewName: (n, host) =>
    horizontal(n, host) ? "AndroidHorizontalScrollView" : "RCTScrollView",
  defaults: { overflow: "scroll" },
  content: {
    viewName: (n, host) =>
      horizontal(n.parent!, host)
        ? "AndroidHorizontalScrollContentView"
        : "RCTScrollContentView",
    defaults: { collapsable: false }
  },
  props: {
    horizontal(n, value, host) {
      host.set(n, "horizontal", value)
      // Both views need row layout so horizontal content spans its children.
      const row = value === true ? "row" : undefined
      host.set(n, "flexDirection", row)
      host.set(n.inner!, "flexDirection", row)
    }
  },
  events: {
    topScroll: (n, event, host) =>
      host.fire(n, "scroll", {
        x: event?.contentOffset?.x ?? 0,
        y: event?.contentOffset?.y ?? 0,
        contentWidth: event?.contentSize?.width ?? 0,
        contentHeight: event?.contentSize?.height ?? 0,
        width: event?.layoutMeasurement?.width ?? 0,
        height: event?.layoutMeasurement?.height ?? 0
      })
  }
}

const text: ViewKind = {
  // Fabric represents text nested inside text as virtual text.
  viewName: (n) => n.parent?.kind.text === true ? "RCTVirtualText" : "RCTText",
  text: true
}

const defaultText = new WeakMap<NativeNode, unknown>()
const pendingText = new WeakMap<ViewHost, Set<NativeNode>>()

const queueText = (n: NativeNode) => {
  let set = pendingText.get(n.host)
  if (set === undefined) pendingText.set(n.host, set = new Set())
  set.add(n)
}

const setText = (n: NativeNode, value: unknown, host: ViewHost) => {
  // Skip if removed or native already shows `value`; include `eventCount` so native accepts it.
  if (value === undefined || n.props.text === value) return
  host.set(n, "text", value)
  host.set(n, "mostRecentEventCount", n.eventCount)
  // Fabric emits no diff when resetting to the last committed text, so send a command too.
  host.command(n, "setTextAndSelection", [n.eventCount, value, -1, -1])
}

/**
 * Applies deferred `defaultValue` updates once all props for a render are set,
 * so `value` and `defaultValue` produce the same text in either prop order.
 *
 * @internal
 */
export const flushInputs = (host: ViewHost) => {
  const set = pendingText.get(host)
  if (set === undefined) return
  pendingText.delete(host)
  for (const n of set) {
    if (n.value === undefined) {
      setText(n, defaultText.get(n), host)
      defaultText.delete(n)
    }
  }
}

const textEvent =
  (name: string) => (n: NativeNode, event: any, host: ViewHost) =>
    host.fire(n, name, { value: event?.text ?? "" })

const input: ViewKind = {
  // Fabric maps both iOS text input names to one `TextInput` component,
  // which swaps `UITextField` for `UITextView` when `multiline` changes.
  viewName: (_, host) =>
    host.os === "ios" ? "RCTSinglelineTextInputView" : "AndroidTextInput",
  defaults: { autoCapitalize: "sentences", underlineColorAndroid: 0 },
  props: {
    value: (n, value, host) => {
      if (value !== undefined) {
        pendingText.get(host)?.delete(n)
        setText(n, value, host)
      } else if (defaultText.has(n)) {
        queueText(n)
      }
    },
    defaultValue: (n, value) => {
      if (value === undefined) defaultText.delete(n)
      else {
        defaultText.set(n, value)
        queueText(n)
      }
    }
  },
  events: {
    topChange(n, event, host) {
      const value = String(event?.text ?? "")
      if (typeof event?.eventCount === "number") {
        n.eventCount = event.eventCount
      }
      // Native shows this text already, so it isn't sent back.
      n.props.text = value
      host.fire(n, "input", { value })
    },
    topSubmitEditing: textEvent("submit"),
    topEndEditing: textEvent("endEditing")
  }
}

/**
 * Seeded with core vocabulary kinds here so `NativeHost` keeps them even when
 * `Native.tags` is tree-shaken.
 *
 * @internal
 */
export const kinds = new Map<string, ViewKind>([
  ["view", { viewName: "RCTView" }],
  ["scroll", scroll],
  ["text", text],
  ["input", input]
])
