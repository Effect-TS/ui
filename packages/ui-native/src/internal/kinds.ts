import type { ScrollPayload, ViewHost, ViewKind } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

const horizontal = (n: NativeNode, host: ViewHost): boolean =>
  host.os === "android" && n.props.horizontal === true

// Retain the previous content style so updates can remove omitted properties.
const contentStyles = new WeakMap<NativeNode, Readonly<Record<string, any>>>()

const direction = (n: NativeNode, host: ViewHost) =>
  host.set(
    n.inner!,
    "flexDirection",
    contentStyles.get(n)?.flexDirection ??
      (n.props.horizontal === true ? "row" : undefined)
  )

const relay = (name: string) => (n: NativeNode, event: any, host: ViewHost) =>
  host.fire(
    n,
    name,
    {
      x: event?.contentOffset?.x ?? 0,
      y: event?.contentOffset?.y ?? 0,
      contentWidth: event?.contentSize?.width ?? 0,
      contentHeight: event?.contentSize?.height ?? 0,
      width: event?.layoutMeasurement?.width ?? 0,
      height: event?.layoutMeasurement?.height ?? 0
    } satisfies ScrollPayload
  )

// Android sends momentum events only to a scroll view that asks for them.
const momentum =
  (name: string) => (n: NativeNode, value: unknown, host: ViewHost) => {
    host.set(n, name, value)
    host.set(
      n,
      "sendMomentumEvents",
      n.props.onMomentumScrollBegin ?? n.props.onMomentumScrollEnd
    )
  }

const scroll: ViewKind = {
  viewName: (n, host) =>
    horizontal(n, host) ? "AndroidHorizontalScrollView" : "RCTScrollView",
  defaults: { overflow: "scroll" },
  content: {
    viewName: (n, host) =>
      horizontal(n.parent!, host)
        ? "AndroidHorizontalScrollContentView"
        : "RCTScrollContentView",
    defaults: { collapsable: false },
    events: {
      topLayout: (n, event, host) =>
        host.fire(n.parent!, "contentSizeChange", {
          width: event?.layout?.width ?? 0,
          height: event?.layout?.height ?? 0
        })
    }
  },
  props: {
    horizontal(n, value, host) {
      host.set(n, "horizontal", value)
      // The scroll view needs row layout so horizontal content spans its children.
      host.set(n, "flexDirection", value === true ? "row" : undefined)
      direction(n, host)
    },
    contentContainerStyle(n, value, host) {
      const was = contentStyles.get(n)
      const style = (value ?? {}) as Record<string, unknown>
      contentStyles.set(n, style)
      for (const key in was) {
        if (!(key in style)) host.set(n.inner!, key, undefined)
      }
      for (const key in style) host.set(n.inner!, key, style[key])
      direction(n, host)
    },
    onMomentumScrollBegin: momentum("onMomentumScrollBegin"),
    onMomentumScrollEnd: momentum("onMomentumScrollEnd"),
    // React Native reports the size the content view is laid out at.
    onContentSizeChange: (n, value, host) =>
      host.set(n.inner!, "onLayout", value)
  },
  events: {
    topScroll: relay("scroll"),
    topScrollBeginDrag: relay("scrollBeginDrag"),
    topScrollEndDrag: relay("scrollEndDrag"),
    topMomentumScrollBegin: relay("momentumScrollBegin"),
    topMomentumScrollEnd: relay("momentumScrollEnd")
  }
}

// As React Native's `Text` sets them: native clips truncated text by
// default, and VoiceOver skips text that isn't accessible.
const textDefaults = { ellipsizeMode: "tail" }
const iosTextDefaults = { ...textDefaults, accessible: true }

const text: ViewKind = {
  // Fabric represents text nested inside text as virtual text.
  viewName: (n) => n.parent?.kind.text === true ? "RCTVirtualText" : "RCTText",
  defaults: (host) => host.os === "ios" ? iosTextDefaults : textDefaults,
  text: true
}

const input: ViewKind = {
  viewName: (_, host) =>
    host.os === "ios" ? "RCTSinglelineTextInputView" : "AndroidTextInput",
  defaults: { accessible: true },
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
