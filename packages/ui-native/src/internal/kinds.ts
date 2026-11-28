import type { ScrollPayload, ViewHost, ViewKind } from "../Native.ts"
import type { NativeNode } from "../NativeHost.ts"

const horizontal = (n: NativeNode, host: ViewHost): boolean =>
  host.os === "android" && n.props.horizontal === true

/**
 * Each scroll view's `keyboardShouldPersistTaps`, which only JS reads.
 *
 * @internal
 */
export const persistTaps = new WeakMap<NativeNode, unknown>()

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

const relayScroll = relay("scroll")

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
    keyboardShouldPersistTaps: (n, value) => persistTaps.set(n, value),
    onMomentumScrollBegin: momentum("onMomentumScrollBegin"),
    onMomentumScrollEnd: momentum("onMomentumScrollEnd"),
    // React Native reports the size the content view is laid out at.
    onContentSizeChange: (n, value, host) =>
      host.set(n.inner!, "onLayout", value)
  },
  events: {
    topScroll(n, event, host) {
      for (const f of scrolls) f(n, event)
      relayScroll(n, event, host)
    },
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

const defaultText = new WeakMap<NativeNode, unknown>()
const pendingText = new WeakMap<ViewHost, Set<NativeNode>>()

const queueText = (n: NativeNode) => {
  let set = pendingText.get(n.host)
  if (set === undefined) pendingText.set(n.host, set = new Set())
  set.add(n)
}

const setText = (n: NativeNode, value: unknown, host: ViewHost) => {
  if (value === undefined || n.props.text === value) return
  host.set(n, "text", value)
  // Native needs the latest event count to accept the update.
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
  defaults: {
    accessible: true,
    autoCapitalize: "sentences",
    underlineColorAndroid: 0
  },
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
 * Setters for props any element takes, added by kit modules such as
 * `Animation`, so the host carries none of their code.
 *
 * @internal
 */
export const props = new Map<
  string,
  (node: NativeNode, value: unknown, host: ViewHost) => void
>()

/** Called after every commit, by kit modules that follow nodes. @internal */
export const commits = new Set<(host: ViewHost) => void>()

/**
 * Called before every commit, by kit modules that set props on nodes they
 * follow, so the commit carries them.
 *
 * @internal
 */
export const precommits = new Set<(host: ViewHost) => void>()

/** Called with every scroll view's `topScroll` event. @internal */
export const scrolls = new Set<(n: NativeNode, event: any) => void>()

/** `LayoutAnimation` configs by view transition type. @internal */
export const layouts = new Map<string, object>()

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
