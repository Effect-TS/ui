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

const input: ViewKind = {
  viewName: (_, host) =>
    host.os === "ios" ? "RCTSinglelineTextInputView" : "AndroidTextInput",
  props: {
    value(n, value, host) {
      // Skip if native already shows `value`; include `eventCount` so native accepts it.
      if (n.props.text === value) return
      host.set(n, "mostRecentEventCount", n.eventCount)
      host.set(n, "text", value)
      // Fabric emits no diff when resetting to the last committed text, so send a command too.
      host.command(n, "setTextAndSelection", [n.eventCount, value, -1, -1])
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
    topSubmitEditing: (n, event, host) =>
      host.fire(n, "submit", { value: event?.text ?? "" })
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
