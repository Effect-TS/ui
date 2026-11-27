import { RefreshControl } from "@effect/ui-native/kit/RefreshControl"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const Message = UiSchema.TaggedEnum({
  Pulled: {},
  Loaded: {},
  Rekeyed: {},
  Toggled: {}
})

const Feed = Native.component({
  name: "Feed",
  model: Schema.Struct({
    pulls: Schema.Number,
    loading: Schema.Boolean,
    key: Schema.String,
    refreshable: Schema.Boolean
  }),
  message: Message
}).make({
  init: () => ({ pulls: 0, loading: false, key: "a", refreshable: true }),
  update: {
    // Only the first pull starts loading.
    Pulled: ($) =>
      $.evolve({ pulls: (pulls) => pulls + 1, loading: $.model.pulls === 0 }),
    Loaded: ($) => $.evolve({ loading: false }),
    Rekeyed: ($) => $.evolve({ key: () => "b" }),
    Toggled: ($) => $.evolve({ refreshable: (on) => !on })
  },
  view: (h, model) =>
    h.view.children(
      h.scroll.style({ flex: 1, margin: 4, backgroundColor: "white" })
        .prop("nestedScrollEnabled", false).children(
          model.refreshable &&
            RefreshControl(h)
              .key(model.key)
              .refreshing(model.loading)
              .style({ colors: ["red"] })
              .on("refresh", Message.Pulled())
        )
    )
})

const setup = (os: string) =>
  FakeFabric.mount(
    (root) => Renderer.mount(Feed, {}, root),
    (color) => `processed ${String(color)}`,
    os
  )

describe("RefreshControl", () => {
  it("wraps the scroll view on Android, taking its outer layout, and keeps refreshing controlled", async () => {
    const { fabric, find, printed, root, settle } = await setup("android")
    assert.strictEqual(
      printed(),
      "<RCTView><AndroidSwipeRefreshLayout><RCTScrollView><RCTScrollContentView></></></></>"
    )
    const control = () => find(FakeFabric.byName("AndroidSwipeRefreshLayout"))
    const scroll = find(FakeFabric.byName("RCTScrollView"))
    assert.deepStrictEqual(control().props, {
      flex: 1,
      margin: 4,
      refreshing: false,
      colors: ["processed red"],
      onRefresh: true
    })
    assert.deepStrictEqual(scroll.props, {
      overflow: "scroll",
      backgroundColor: "processed white",
      nestedScrollEnabled: false,
      flexGrow: 1,
      flexShrink: 1
    })

    // Native shows the indicator when the pull starts, so taking it sends
    // nothing; stopping it, or rejecting a pull, tells native.
    const tag = control().tag
    fabric.emit(control(), "topRefresh", {})
    await settle()
    root.send(Message.Loaded())
    await settle()
    fabric.emit(control(), "topRefresh", {})
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.deepStrictEqual(fabric.commands, [
      [tag, "setNativeRefreshing", [false]],
      [tag, "setNativeRefreshing", [false]]
    ])

    // A sole child with a new key is inserted before the old one is removed.
    root.send(Message.Rekeyed())
    await settle()
    assert.strictEqual(
      printed(),
      "<RCTView><AndroidSwipeRefreshLayout><RCTScrollView><RCTScrollContentView></></></></>"
    )
    assert.notStrictEqual(control().tag, tag)
    assert.deepStrictEqual(control().props, {
      flex: 1,
      margin: 4,
      refreshing: false,
      colors: ["processed red"],
      onRefresh: true
    })

    root.send(Message.Toggled())
    await settle()
    assert.strictEqual(
      printed(),
      "<RCTView><RCTScrollView><RCTScrollContentView></></></>"
    )
    const unwrapped = find(FakeFabric.byName("RCTScrollView"))
    assert.notStrictEqual(unwrapped.tag, scroll.tag)
    assert.deepStrictEqual(unwrapped.props, {
      overflow: "scroll",
      backgroundColor: "processed white",
      nestedScrollEnabled: false,
      flex: 1,
      margin: 4
    })
  })

  it("puts a hidden view in the scroll view, before its content, on iOS", async () => {
    const { find, printed } = await setup("ios")
    assert.strictEqual(
      printed(),
      "<RCTView><RCTScrollView><PullToRefreshView></><RCTScrollContentView></></></>"
    )
    assert.strictEqual(
      find(FakeFabric.byName("PullToRefreshView")).props.position,
      "absolute"
    )
    assert.strictEqual(find(FakeFabric.byName("RCTScrollView")).props.margin, 4)
  })
})
