import type { ViewHost, ViewKind } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

// Android has its own views for horizontal scrolling.
const horizontal = (n: NativeNode, host: ViewHost): boolean =>
  host.os === "android" && n.props.horizontal === true

const scroll: ViewKind = {
  viewName: (n, host) =>
    horizontal(n, host) ? "AndroidHorizontalScrollView" : "RCTScrollView",
  // React Native's ScrollView styles its view as scrolling.
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
      // `text` follows native's edits, so this only sends a value that
      // differs from what the field shows. Native drops text sent for an
      // older edit than its own, so it carries the latest edit's count.
      if (n.props.text === value) return
      host.set(n, "mostRecentEventCount", n.eventCount)
      host.set(n, "text", value)
      // Resetting to the tree's existing text produces no Fabric diff,
      // even if the user edited the field. Send a command too, as
      // TextInput does.
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
 * The view kinds by tag: the vocabulary's, held here so the host has them
 * whatever the bundler keeps of `Native`, and those `Native.defineView`
 * adds.
 *
 * @internal
 */
export const kinds = new Map<string, ViewKind>([
  ["view", { viewName: "RCTView" }],
  ["scroll", scroll],
  ["text", text],
  ["input", input]
])
